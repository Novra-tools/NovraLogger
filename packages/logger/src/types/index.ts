/** 日志级别定义 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 错误对象的结构化序列化结果 */
export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
}

/** 结构化传参选项 */
export interface LogOptions {
  /** 业务模块名 */
  module?: string;
  /** 执行方法/函数名 */
  method?: string;
  /** 附加数据 */
  data?: unknown;
  /** 日志消息 */
  message: string;
  /** 用户唯一标识（用于多用户目录分流） */
  userId?: string;
  /** 租户或组织标识 */
  tenantId?: string;
  /** 窗口或进程标识 */
  windowId?: number;
  /** 动态扩展字段 */
  [key: string]: unknown;
}

/** 日志条目完整结构 */
export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  formattedTime: string;
  module: string;
  method?: string;
  message: string;
  data?: unknown;
  error?: SerializedError;
  userId?: string;
  tenantId?: string;
  windowId?: number;
}

/** Logger 配置选项 */
export interface LoggerConfig {
  /** 应用名称（用于未指定路径时生成系统规范应用日志目录） */
  appName?: string;
  /** 日志存放根目录，默认自动计算系统推荐目录或当前目录 logs */
  logDir?: string;
  /** 当前启用的最低日志级别，默认 production 下为 'info'，非 production 下为 'debug' */
  level?: LogLevel;
  /** 单个日志文件触发轮转的最大字节数，默认 10MB (10 * 1024 * 1024) */
  maxFileSize?: number;
  /** 同类日志保留的最大文件总数（包含当前活动文件与历史轮转文件），默认 3 */
  maxFiles?: number;
  /** 检查文件大小的写入操作节流计数间隔，默认每 50 次写入检测一次 */
  checkInterval?: number;
  /** 是否开启敏感信息脱敏，默认 true */
  maskSensitive?: boolean;
  /** 附加的自定义敏感字段名数组（不区分大小写） */
  sensitiveKeys?: string[];
  /** 是否在控制台同步打印输出，默认开发环境下开启，生产环境下只打印 warn/error */
  enableConsole?: boolean;
  /** 自定义日志行格式化器 */
  formatter?: (entry: LogEntry) => string;
}

/** 作用域 Logger 接口（固定模块和方法前缀） */
export interface IScopedLogger {
  debug(message: string, data?: unknown): void;
  debug(options: LogOptions): void;

  info(message: string, data?: unknown): void;
  info(options: LogOptions): void;

  warn(message: string, data?: unknown): void;
  warn(options: LogOptions): void;

  error(message: string, errorOrData?: unknown): void;
  error(options: LogOptions): void;

  fatal(message: string, errorOrData?: unknown): void;
  fatal(options: LogOptions): void;
}

/** 主 Logger 实例接口 */
export interface ILogger extends IScopedLogger {
  /** 创建一个带有固定 module / method 作用域的子 Logger */
  scope(moduleName: string, methodName?: string): IScopedLogger;
  /** 直接写入底层日志文件 */
  write(entry: Partial<LogEntry> & { level: LogLevel; message: string }): void;
  /** 获取当前配置的根日志目录 */
  getLogDir(): string;
  /** 获取指定用户的日志目录 */
  getUserLogDir(userId?: string): string;
  /** 压缩打包日志（供用户反馈与故障上传） */
  packLogs(options?: PackLogsOptions): Promise<PackLogsResult>;
  /** 清理日志（支持按用户、天数或全量清理） */
  cleanLogs(options?: CleanLogsOptions): Promise<CleanLogsResult>;
  /** 一键清理本地指定/当前日志（cleanLogs 的便捷别名） */
  clearLogs(options?: CleanLogsOptions): Promise<CleanLogsResult>;
  /** 一键彻底清空本地所有日志及历史归档 */
  clearAllLogs(): Promise<CleanLogsResult>;
}

/** 压缩打包日志选项 */
export interface PackLogsOptions {
  /** 要打包的源日志根目录，默认使用当前 Logger 实例的根目录 */
  sourceDir?: string;
  /** 目标输出的 zip 完整绝对路径或文件名；默认生成在 `<logDir>/diagnostics/novra-logs-<timestamp>.zip` */
  outputZipPath?: string;
  /** 如果指定 userId，则只打包该用户的专属日志 */
  userId?: string;
  /** 文件过滤函数，返回 false 则跳过该文件 */
  filter?: (fileName: string, fullPath: string) => boolean;
  /** 额外写入压缩包的元数据（将在 zip 根目录下生成 metadata.json） */
  metadata?: Record<string, unknown>;
  /** 最多保留的临时待上传压缩包数量，超出会自动清理最旧的 zip，默认 3 */
  maxPendingZips?: number;
}

/** 压缩打包日志结果 */
export interface PackLogsResult {
  /** 生成的 zip 文件绝对路径 */
  zipPath: string;
  /** 生成的 zip 文件字节大小 */
  size: number;
  /** 包含在 zip 内的文件总数 */
  fileCount: number;
}

/** 清理历史日志选项 */
export interface CleanLogsOptions {
  /** 要清理的日志根目录 */
  logDir?: string;
  /** 只清理指定用户的日志目录 */
  userId?: string;
  /** 是否清理整个日志根目录下的全部日志（包含 app、所有 user 目录及 diagnostics 压缩包），默认 false */
  clearAll?: boolean;
  /** 清理超过指定天数的日志文件（天数），未传则直接清理目标目录中全部日志文件 */
  maxAgeDays?: number;
  /** 是否清理崩溃转储文件，并指定保留最近几份 .dmp 文件，默认保留 2 份 */
  retainCrashDumps?: number;
  /** Crashpad 崩溃转储目录（如 Electron app.getPath('crashDumps')） */
  crashDumpsDir?: string;
}

/** 清理历史日志结果 */
export interface CleanLogsResult {
  /** 成功删除的文件数量 */
  deletedCount: number;
  /** 删除失败的文件数量 */
  failedCount: number;
}

/** 渲染进程 / 前端跨进程发送的日志载荷 */
export interface RendererLogPayload {
  level: LogLevel;
  module: string;
  method?: string;
  message: string;
  data?: unknown;
  error?: SerializedError;
  userId?: string;
  tenantId?: string;
  windowId?: number;
  createdAt: number;
}

/** 渲染进程 Logger 初始化配置 */
export interface RendererLoggerOptions {
  /** 派发日志载荷到宿主/主进程的发送函数 (如通过 Electron IPC 或 Tauri invoke) */
  send: (payload: RendererLogPayload) => void | Promise<unknown>;
  /** 默认模块名，默认为 'renderer' */
  defaultModule?: string;
  /** 动态获取当前用户 ID 的函数 */
  getUserId?: () => string | undefined;
  /** 动态获取当前租户 ID 的函数 */
  getTenantId?: () => string | undefined;
  /** 动态获取当前窗口 ID 的函数 */
  getWindowId?: () => number | undefined;
  /** 是否开启控制台同步输出，默认为非 production 环境开启 */
  enableConsole?: boolean;
  /** 生产环境下的自定义错误上报钩子 (如接入 Sentry 等) */
  onErrorCapture?: (error: unknown, payload: RendererLogPayload) => void;
}
