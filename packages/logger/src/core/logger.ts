import { appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  CleanLogsOptions,
  CleanLogsResult,
  ILogger,
  IScopedLogger,
  LogEntry,
  LogLevel,
  LogOptions,
  LoggerConfig,
  PackLogsOptions,
  PackLogsResult,
} from '../types';
import { LogCleaner } from './cleaner';
import { LogPacker } from './packer';
import { PathResolver } from './path-resolver';
import { FileRotator } from './rotator';
import { LogSanitizer } from './sanitizer';

/** 日志级别优先级权重 */
const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * 将数字补零对齐为固定长度字符串
 */
function pad(num: number, length = 2): string {
  return String(num).padStart(length, '0');
}

/**
 * 格式化本地高精度时间戳：YYYY/MM/DD HH:mm:ss.SSS
 */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const dateStr = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('/');

  const timeStr = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':');

  return `${dateStr} ${timeStr}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 核心 Logger 引擎类（纯 Node.js 实现，零宿主外壳耦合）
 */
export class Logger implements ILogger {
  private config: Required<LoggerConfig>;
  private pathResolver: PathResolver;
  private sanitizer: LogSanitizer;
  private rotator: FileRotator;
  private packer: LogPacker;
  private cleaner: LogCleaner;

  constructor(config: LoggerConfig = {}) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.TYPE === 'production';

    this.config = {
      appName: config.appName ?? 'novra-app',
      logDir: config.logDir ?? '',
      level: config.level ?? (isProd ? 'info' : 'debug'),
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024,
      maxFiles: config.maxFiles ?? 3,
      checkInterval: config.checkInterval ?? 50,
      maskSensitive: config.maskSensitive ?? true,
      sensitiveKeys: config.sensitiveKeys ?? [],
      enableConsole: config.enableConsole ?? !isProd,
      formatter: config.formatter ?? this.defaultFormatter.bind(this),
    };

    this.pathResolver = new PathResolver(this.config.appName, this.config.logDir || undefined);
    this.sanitizer = new LogSanitizer(this.config.sensitiveKeys);
    this.rotator = new FileRotator(
      this.config.maxFileSize,
      this.config.maxFiles,
      this.config.checkInterval
    );
    this.packer = new LogPacker(this.pathResolver);
    this.cleaner = new LogCleaner(this.pathResolver);
  }

  /**
   * 默认日志行格式化器
   */
  private defaultFormatter(entry: LogEntry): string {
    const scopeParts: string[] = [];
    if (entry.module) scopeParts.push(`[${entry.module}]`);
    if (entry.method) scopeParts.push(`[${entry.method}]`);
    const scopeStr = scopeParts.length > 0 ? `${scopeParts.join(' ')} ` : '';

    let suffix = '';
    const payloadData = entry.error ?? entry.data;
    if (payloadData !== undefined) {
      const stringified = this.config.maskSensitive
        ? this.sanitizer.stringify(payloadData)
        : typeof payloadData === 'object'
          ? JSON.stringify(payloadData)
          : String(payloadData);
      suffix = ` ${stringified}`;
    }

    const sanitizedMessage = this.config.maskSensitive
      ? this.sanitizer.sanitizeText(entry.message)
      : entry.message;

    return `[${entry.formattedTime}] [${entry.level.toUpperCase()}] ${scopeStr}${sanitizedMessage}${suffix}`;
  }

  /**
   * 判断指定日志级别是否达到当前配置的输出阈值
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[this.config.level];
  }

  /**
   * 统一写入一条日志到物理文件，并按需输出至控制台
   */
  public write(rawEntry: Partial<LogEntry> & { level: LogLevel; message: string }): void {
    if (!this.isLevelEnabled(rawEntry.level)) {
      return;
    }

    const timestamp = rawEntry.timestamp ?? Date.now();
    const entry: LogEntry = {
      level: rawEntry.level,
      timestamp,
      formattedTime: formatLocalTimestamp(new Date(timestamp)),
      module: rawEntry.module ?? this.config.appName,
      method: rawEntry.method,
      message: String(rawEntry.message ?? ''),
      data: rawEntry.data,
      error: rawEntry.error ? this.sanitizer.serializeError(rawEntry.error) : undefined,
      userId: rawEntry.userId,
      tenantId: rawEntry.tenantId,
      windowId: rawEntry.windowId,
    };

    // 1. 确定物理目标文件路径（用户专属日志 vs 全局应用日志）
    const targetFilePath = entry.userId
      ? this.pathResolver.getUserLogFilePath(entry.userId, 'user.log')
      : this.pathResolver.getMainLogFilePath();

    this.pathResolver.ensureDir(dirname(targetFilePath));

    // 2. 检查并执行日志文件轮转（写入节流防频繁 stat）
    if (this.rotator.shouldCheck(targetFilePath)) {
      this.rotator.rotate(targetFilePath);
    }

    // 3. 格式化日志行并追加写入磁盘
    const logLine = this.config.formatter(entry);
    try {
      appendFileSync(targetFilePath, `${logLine}\n`, 'utf8');
    } catch (err) {
      console.warn(`[@novra/logger] Failed to write log to ${targetFilePath}:`, err);
    }

    // 4. 同步输出至标准控制台（受配置控制）
    if (this.config.enableConsole) {
      const consoleArgs = [logLine];
      switch (entry.level) {
        case 'debug':
          console.debug(...consoleArgs);
          break;
        case 'info':
          console.info(...consoleArgs);
          break;
        case 'warn':
          console.warn(...consoleArgs);
          break;
        case 'error':
        case 'fatal':
          console.error(...consoleArgs);
          break;
      }
    }
  }

  /**
   * 内部处理多重重载签名的日志记录调度函数
   */
  private logInternal(
    level: LogLevel,
    defaultModule: string,
    defaultMethod: string | undefined,
    msgOrOpts: string | LogOptions,
    extraData?: unknown
  ): void {
    if (typeof msgOrOpts === 'object' && msgOrOpts !== null) {
      const opts = msgOrOpts as LogOptions;
      this.write({
        level,
        module: opts.module ?? defaultModule,
        method: opts.method ?? defaultMethod,
        message: opts.message,
        data: opts.data !== undefined ? opts.data : extraData,
        error: opts.data instanceof Error ? opts.data : undefined,
        userId: opts.userId,
        tenantId: opts.tenantId,
        windowId: opts.windowId,
      });
    } else {
      this.write({
        level,
        module: defaultModule,
        method: defaultMethod,
        message: String(msgOrOpts),
        data: extraData instanceof Error ? undefined : extraData,
        error: extraData instanceof Error ? extraData : undefined,
      });
    }
  }

  public debug(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('debug', this.config.appName, undefined, msgOrOpts, data);
  }

  public info(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('info', this.config.appName, undefined, msgOrOpts, data);
  }

  public warn(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('warn', this.config.appName, undefined, msgOrOpts, data);
  }

  public error(msgOrOpts: string | LogOptions, errorOrData?: unknown): void {
    this.logInternal('error', this.config.appName, undefined, msgOrOpts, errorOrData);
  }

  public fatal(msgOrOpts: string | LogOptions, errorOrData?: unknown): void {
    this.logInternal('fatal', this.config.appName, undefined, msgOrOpts, errorOrData);
  }

  /**
   * 创建一个具有固定模块名和方法名的作用域子 Logger
   */
  public scope(moduleName: string, methodName?: string): IScopedLogger {
    return {
      debug: (msgOrOpts: string | LogOptions, data?: unknown) =>
        this.logInternal('debug', moduleName, methodName, msgOrOpts, data),
      info: (msgOrOpts: string | LogOptions, data?: unknown) =>
        this.logInternal('info', moduleName, methodName, msgOrOpts, data),
      warn: (msgOrOpts: string | LogOptions, data?: unknown) =>
        this.logInternal('warn', moduleName, methodName, msgOrOpts, data),
      error: (msgOrOpts: string | LogOptions, errorOrData?: unknown) =>
        this.logInternal('error', moduleName, methodName, msgOrOpts, errorOrData),
      fatal: (msgOrOpts: string | LogOptions, errorOrData?: unknown) =>
        this.logInternal('fatal', moduleName, methodName, msgOrOpts, errorOrData),
    };
  }

  /**
   * 将当前日志目录（或指定用户日志目录）打包为 zip 文件供反馈上传
   */
  public async packLogs(options: PackLogsOptions = {}): Promise<PackLogsResult> {
    return this.packer.pack(options);
  }

  /**
   * 清理日志文件（支持按用户、按天数或全量清理）
   */
  public async cleanLogs(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    return this.cleaner.clean(options);
  }

  /**
   * 一键清理本地日志（cleanLogs 的语义别名）
   */
  public async clearLogs(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    return this.cleaner.clean(options);
  }

  /**
   * 一键彻底清空本地所有日志、所有用户隔离日志及历史归档文件
   */
  public async clearAllLogs(): Promise<CleanLogsResult> {
    return this.cleaner.clearAll();
  }

  /**
   * 获取当前配置的根日志目录
   */
  public getLogDir(): string {
    return this.pathResolver.getBaseLogDir();
  }

  /**
   * 获取指定用户的专属日志目录
   */
  public getUserLogDir(userId?: string): string {
    return this.pathResolver.getUserLogDir(userId);
  }
}

/**
 * 工厂函数：创建并返回一个全新的 Logger 实例
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}
