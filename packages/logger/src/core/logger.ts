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

/** Log level priority weights */
const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * Pad a number with leading zeros to a fixed length string
 */
function pad(num: number, length = 2): string {
  return String(num).padStart(length, '0');
}

/**
 * Format local high-precision timestamp: YYYY/MM/DD HH:mm:ss.SSS
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
 * Core Logger engine class (pure Node.js implementation, zero host shell coupling)
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
      appName: config.appName ?? 'desklog-app',
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
   * Default log line formatter
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
   * Check if the specified log level meets the configured output threshold
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[this.config.level];
  }

  /**
   * Write a log entry to disk and optionally mirror to console
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

    // 1. Determine physical target file path (user-scoped log vs main app log)
    const targetFilePath = entry.userId
      ? this.pathResolver.getUserLogFilePath(entry.userId, 'user.log')
      : this.pathResolver.getMainLogFilePath();

    this.pathResolver.ensureDir(dirname(targetFilePath));

    // 2. Check and perform log file rotation (throttled to avoid frequent stat checks)
    if (this.rotator.shouldCheck(targetFilePath)) {
      this.rotator.rotate(targetFilePath);
    }

    // 3. Format log line and append to disk
    const logLine = this.config.formatter(entry);
    try {
      appendFileSync(targetFilePath, `${logLine}\n`, 'utf8');
    } catch (err) {
      console.warn(`[desklog] Failed to write log to ${targetFilePath}:`, err);
    }

    // 4. Mirror output to standard console if enabled
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
   * Internal dispatcher handling multiple overloaded method signatures
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
   * Create a scoped child logger with fixed module and method names
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
   * Package current logs (or specified user logs) into a ZIP file for diagnostics
   */
  public async packLogs(options: PackLogsOptions = {}): Promise<PackLogsResult> {
    return this.packer.pack(options);
  }

  /**
   * Clean log files (by user, retention days, or all logs)
   */
  public async cleanLogs(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    return this.cleaner.clean(options);
  }

  /**
   * Convenient alias for cleanLogs
   */
  public async clearLogs(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    return this.cleaner.clean(options);
  }

  /**
   * Thoroughly wipe all local logs, user-isolated logs, and historical archives
   */
  public async clearAllLogs(): Promise<CleanLogsResult> {
    return this.cleaner.clearAll();
  }

  /**
   * Get the configured root log directory
   */
  public getLogDir(): string {
    return this.pathResolver.getBaseLogDir();
  }

  /**
   * Get the dedicated log directory for a specific user
   */
  public getUserLogDir(userId?: string): string {
    return this.pathResolver.getUserLogDir(userId);
  }
}

/**
 * Factory function: create and return a new Logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

