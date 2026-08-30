/** Log level definitions */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Structured serialization result of an Error object */
export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
}

/** Structured logging options */
export interface LogOptions {
  /** Business module name */
  module?: string;
  /** Executing method or function name */
  method?: string;
  /** Additional payload data */
  data?: unknown;
  /** Log message */
  message: string;
  /** Unique user identifier (for multi-user directory isolation) */
  userId?: string;
  /** Tenant or organization identifier */
  tenantId?: string;
  /** Window or process identifier */
  windowId?: number;
  /** Dynamic extension fields */
  [key: string]: unknown;
}

/** Complete log entry structure */
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

/** Logger configuration options */
export interface LoggerConfig {
  /** Application name (used to generate canonical log directory when not specified) */
  appName?: string;
  /** Root directory for storing logs. Defaults to system recommended directory or ./logs */
  logDir?: string;
  /** Minimum enabled log level. Defaults to 'info' in production, 'debug' otherwise */
  level?: LogLevel;
  /** Maximum file size in bytes before triggering rotation. Defaults to 10MB (10 * 1024 * 1024) */
  maxFileSize?: number;
  /** Maximum number of log files to retain per category (active + historical). Defaults to 3 */
  maxFiles?: number;
  /** Throttle interval for file size checking (checks every N write operations). Defaults to 50 */
  checkInterval?: number;
  /** Whether to enable sensitive data masking. Defaults to true */
  maskSensitive?: boolean;
  /** Additional custom sensitive field names to mask (case-insensitive) */
  sensitiveKeys?: string[];
  /** Whether to mirror output to the console. Defaults to true in development, warn/error only in production */
  enableConsole?: boolean;
  /** Custom log line formatter */
  formatter?: (entry: LogEntry) => string;
}

/** Scoped Logger interface (with fixed module and method prefixes) */
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

/** Main Logger instance interface */
export interface ILogger extends IScopedLogger {
  /** Create a child logger scoped to a specific module and method */
  scope(moduleName: string, methodName?: string): IScopedLogger;
  /** Write directly to the underlying log file */
  write(entry: Partial<LogEntry> & { level: LogLevel; message: string }): void;
  /** Get the configured root log directory */
  getLogDir(): string;
  /** Get the dedicated log directory for a specific user */
  getUserLogDir(userId?: string): string;
  /** Package logs into a ZIP archive for diagnostic feedback and reporting */
  packLogs(options?: PackLogsOptions): Promise<PackLogsResult>;
  /** Clean historical logs (by user, retention days, or all logs) */
  cleanLogs(options?: CleanLogsOptions): Promise<CleanLogsResult>;
  /** Convenient alias for cleanLogs */
  clearLogs(options?: CleanLogsOptions): Promise<CleanLogsResult>;
  /** Thoroughly wipe all local logs and historical archives */
  clearAllLogs(): Promise<CleanLogsResult>;
}

/** Options for packaging logs into a ZIP archive */
export interface PackLogsOptions {
  /** Source directory to pack. Defaults to the Logger instance's root log directory */
  sourceDir?: string;
  /** Target absolute output path or file name. Defaults to `<logDir>/diagnostics/novra-logs-<timestamp>.zip` */
  outputZipPath?: string;
  /** If specified, packs only logs belonging to this user */
  userId?: string;
  /** File filter function. Return false to skip a file */
  filter?: (fileName: string, fullPath: string) => boolean;
  /** Extra metadata to include (written to metadata.json in the ZIP root) */
  metadata?: Record<string, unknown>;
  /** Maximum number of temporary ZIP archives to retain. Oldest will be purged. Defaults to 3 */
  maxPendingZips?: number;
}

/** Result of log packaging */
export interface PackLogsResult {
  /** Absolute path of the generated ZIP file */
  zipPath: string;
  /** File size of the generated ZIP in bytes */
  size: number;
  /** Total number of files contained in the ZIP */
  fileCount: number;
}

/** Options for cleaning historical logs */
export interface CleanLogsOptions {
  /** Root directory to clean */
  logDir?: string;
  /** Only clean logs belonging to the specified user */
  userId?: string;
  /** Whether to wipe all logs in the root directory (app, users, and diagnostics). Defaults to false */
  clearAll?: boolean;
  /** Delete log files older than the specified number of days. If omitted, cleans all matching logs */
  maxAgeDays?: number;
  /** Number of recent .dmp crash dump files to retain. Defaults to 2 */
  retainCrashDumps?: number;
  /** Directory where crash dump files are stored (e.g. Electron app.getPath('crashDumps')) */
  crashDumpsDir?: string;
}

/** Result of log cleanup */
export interface CleanLogsResult {
  /** Number of files successfully deleted */
  deletedCount: number;
  /** Number of files that failed to delete */
  failedCount: number;
}

/** Log payload sent from renderer / frontend across processes */
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

/** Configuration for initializing a renderer process Logger */
export interface RendererLoggerOptions {
  /** Dispatch function to send log payload to the host/main process (e.g. Electron IPC or Tauri invoke) */
  send: (payload: RendererLogPayload) => void | Promise<unknown>;
  /** Default module name. Defaults to 'renderer' */
  defaultModule?: string;
  /** Dynamic getter function for current user ID */
  getUserId?: () => string | undefined;
  /** Dynamic getter function for current tenant ID */
  getTenantId?: () => string | undefined;
  /** Dynamic getter function for current window ID */
  getWindowId?: () => number | undefined;
  /** Whether to enable console mirror output. Defaults to true in non-production environments */
  enableConsole?: boolean;
  /** Custom error reporting hook for production environments (e.g. Sentry) */
  onErrorCapture?: (error: unknown, payload: RendererLogPayload) => void;
}
