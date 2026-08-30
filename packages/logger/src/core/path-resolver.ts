import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Intelligent log path resolver and manager (pure Node.js, zero host framework dependency)
 */
export class PathResolver {
  private baseLogDir: string;
  private appName: string;

  constructor(appName = 'novra-app', customLogDir?: string) {
    this.appName = appName;
    this.baseLogDir = customLogDir ? customLogDir : this.resolveDefaultBaseDir(appName);
  }

  /**
   * Resolve standard canonical OS log storage root directory
   */
  private resolveDefaultBaseDir(appName: string): string {
    // 1. Check explicit environment variable override
    if (process.env.NOVRA_LOG_DIR) {
      return process.env.NOVRA_LOG_DIR;
    }

    const home = homedir();
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        const appData = process.env.APPDATA || process.env.LOCALAPPDATA || join(home, 'AppData', 'Roaming');
        return join(appData, appName, 'logs');
      }

      if (platform === 'darwin') {
        return join(home, 'Library', 'Logs', appName);
      }

      // Linux / Unix platforms follow XDG Base Directory specification
      const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
      return join(xdgData, appName, 'logs');
    } catch {
      // Fallback to ./logs in current working directory in sandboxed or permission-restricted environments
      return join(process.cwd(), 'logs');
    }
  }

  /**
   * Ensure directory exists physically on disk and return its path
   */
  public ensureDir(dirPath: string): string {
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch (err) {
      // Fault tolerance: ignore if directory already exists
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.warn(`[@novra/logger] Failed to ensure directory: ${dirPath}`, err);
      }
    }
    return dirPath;
  }

  /**
   * Get the base root log directory
   */
  public getBaseLogDir(): string {
    return this.ensureDir(this.baseLogDir);
  }

  /**
   * Get the main application / global service log directory
   */
  public getAppLogDir(): string {
    return this.ensureDir(join(this.getBaseLogDir(), 'app'));
  }

  /**
   * Sanitize userId to a safe directory name, preventing path traversal attacks
   */
  public getSafeUserDirName(userId?: string): string | undefined {
    if (!userId || typeof userId !== 'string') return undefined;
    const safe = userId.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe || undefined;
  }

  /**
   * Get the dedicated log directory for a specific user (multi-user/multi-tenant isolation)
   */
  public getUserLogDir(userId?: string): string {
    const safeName = this.getSafeUserDirName(userId);
    if (!safeName) {
      return this.getAppLogDir();
    }
    return this.ensureDir(join(this.getBaseLogDir(), 'users', safeName));
  }

  /**
   * Get the main log file path (e.g. `.../logs/app/app.log`)
   */
  public getMainLogFilePath(): string {
    return join(this.getAppLogDir(), `${this.appName}.log`);
  }

  /**
   * Get the log file path for a specific user (e.g. `.../logs/users/<userId>/user.log`)
   */
  public getUserLogFilePath(userId?: string, fileName = 'user.log'): string {
    return join(this.getUserLogDir(userId), fileName);
  }

  /**
   * Get the directory for temporary diagnostic zip packages
   */
  public getDiagnosticsDir(): string {
    return this.ensureDir(join(this.getBaseLogDir(), 'diagnostics'));
  }
}
