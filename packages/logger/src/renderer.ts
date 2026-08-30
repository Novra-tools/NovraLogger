import type {
  IScopedLogger,
  LogLevel,
  LogOptions,
  RendererLogPayload,
  RendererLoggerOptions,
  SerializedError,
} from './types';

/** Log level priority weights */
const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * Serialize Error object into a plain struct for safe cross-process IPC transmission
 */
function serializeError(error: unknown): SerializedError | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? '') };
  }
  return { message: String(error) };
}

/**
 * Deep clean and clone objects, breaking circular references and removing non-cloneable functions to avoid DataCloneError
 */
function safeJsonClone(val: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'object' && typeof val !== 'function') {
    return val;
  }
  try {
    const seen = new WeakSet();
    const str = JSON.stringify(val, (_, value) => {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
    return str ? JSON.parse(str) : undefined;
  } catch (err) {
    return `[Unclonable Object: ${String(err)}]`;
  }
}

/**
 * Universal cross-platform/frontend Renderer process Logger (pure JS, zero Node native module dependencies)
 */
export class RendererLogger implements IScopedLogger {
  private options: RendererLoggerOptions;
  private defaultModule: string;

  constructor(options: RendererLoggerOptions) {
    this.options = options;
    this.defaultModule = options.defaultModule ?? 'renderer';
  }

  private isProduction(): boolean {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.NODE_ENV === 'production' || process.env.TYPE === 'production';
    }
    return false;
  }

  /**
   * Write and dispatch a log payload to the host/main process
   */
  private logInternal(
    level: LogLevel,
    moduleName: string,
    methodName: string | undefined,
    msgOrOpts: string | LogOptions,
    extraData?: unknown
  ): void {
    const isProd = this.isProduction();
    if (level === 'debug' && isProd) {
      return;
    }

    let finalModule = moduleName;
    let finalMethod = methodName;
    let message = '';
    let finalData: unknown = extraData;

    if (typeof msgOrOpts === 'object' && msgOrOpts !== null) {
      const opts = msgOrOpts as LogOptions;
      finalModule = opts.module ?? moduleName;
      finalMethod = opts.method ?? methodName;
      message = opts.message;
      finalData = opts.data !== undefined ? opts.data : extraData;
    } else {
      message = String(msgOrOpts);
    }

    const userId = this.options.getUserId?.();
    const tenantId = this.options.getTenantId?.();
    const windowId = this.options.getWindowId?.();

    const isError = finalData instanceof Error;
    const payload: RendererLogPayload = {
      level,
      module: finalModule,
      method: finalMethod,
      message,
      data: isError ? undefined : safeJsonClone(finalData),
      error: isError ? serializeError(finalData) : undefined,
      userId,
      tenantId,
      windowId,
      createdAt: Date.now(),
    };

    // 1. Dispatch to main process disk storage via host-injected send function
    try {
      this.options.send(payload);
    } catch (err) {
      console.warn('[@novra/logger/renderer] Failed to send log payload:', err);
    }

    // 2. Custom error reporting in production (e.g. Sentry)
    if (level === 'error' || level === 'fatal') {
      if (this.options.onErrorCapture) {
        try {
          this.options.onErrorCapture(finalData ?? message, payload);
        } catch {}
      }
    }

    // 3. Mirror to console in development
    const enableConsole = this.options.enableConsole ?? !isProd;
    if (enableConsole) {
      const prefix = `[${finalModule}${finalMethod ? `:${finalMethod}` : ''}]`;
      const consoleArgs = [prefix, message];
      if (finalData !== undefined) consoleArgs.push(finalData as string);

      switch (level) {
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

  public debug(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('debug', this.defaultModule, undefined, msgOrOpts, data);
  }

  public info(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('info', this.defaultModule, undefined, msgOrOpts, data);
  }

  public warn(msgOrOpts: string | LogOptions, data?: unknown): void {
    this.logInternal('warn', this.defaultModule, undefined, msgOrOpts, data);
  }

  public error(msgOrOpts: string | LogOptions, errorOrData?: unknown): void {
    this.logInternal('error', this.defaultModule, undefined, msgOrOpts, errorOrData);
  }

  public fatal(msgOrOpts: string | LogOptions, errorOrData?: unknown): void {
    this.logInternal('fatal', this.defaultModule, undefined, msgOrOpts, errorOrData);
  }

  /**
   * Create a scoped child logger
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
}

/**
 * Factory function: create a renderer process Logger
 */
export function createRendererLogger(options: RendererLoggerOptions): RendererLogger {
  return new RendererLogger(options);
}
