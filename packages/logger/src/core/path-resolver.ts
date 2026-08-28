import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 智能日志存储路径计算与管理器（完全基于 Node.js，零宿主依赖）
 */
export class PathResolver {
  private baseLogDir: string;
  private appName: string;

  constructor(appName = 'novra-app', customLogDir?: string) {
    this.appName = appName;
    this.baseLogDir = customLogDir ? customLogDir : this.resolveDefaultBaseDir(appName);
  }

  /**
   * 根据当前运行平台推断标准系统级日志存储根目录
   */
  private resolveDefaultBaseDir(appName: string): string {
    // 1. 优先读取环境变量显式指定的目录
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

      // Linux / Unix 平台遵循 XDG Base Directory 规范
      const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
      return join(xdgData, appName, 'logs');
    } catch {
      // 在极特殊环境（如受限沙箱或无权限读取主目录）下回退到当前工作目录下的 logs
      return join(process.cwd(), 'logs');
    }
  }

  /**
   * 确保目录物理存在并返回该路径
   */
  public ensureDir(dirPath: string): string {
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch (err) {
      // 容错处理：若目录已存在则忽略
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.warn(`[@novra/logger] Failed to ensure directory: ${dirPath}`, err);
      }
    }
    return dirPath;
  }

  /**
   * 获取日志基础根目录
   */
  public getBaseLogDir(): string {
    return this.ensureDir(this.baseLogDir);
  }

  /**
   * 获取主应用/全局服务日志目录
   */
  public getAppLogDir(): string {
    return this.ensureDir(join(this.getBaseLogDir(), 'app'));
  }

  /**
   * 将 userId 安全清洗为合法的文件夹名称，避免非法路径字符导致安全隐患
   */
  public getSafeUserDirName(userId?: string): string | undefined {
    if (!userId || typeof userId !== 'string') return undefined;
    const safe = userId.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe || undefined;
  }

  /**
   * 获取指定用户的专属日志目录（多用户/多租户隔离）
   */
  public getUserLogDir(userId?: string): string {
    const safeName = this.getSafeUserDirName(userId);
    if (!safeName) {
      return this.getAppLogDir();
    }
    return this.ensureDir(join(this.getBaseLogDir(), 'users', safeName));
  }

  /**
   * 获取主日志文件路径（例如 `.../logs/app/app.log`）
   */
  public getMainLogFilePath(): string {
    return join(this.getAppLogDir(), `${this.appName}.log`);
  }

  /**
   * 获取指定用户的日志文件路径（例如 `.../logs/users/<userId>/user.log`）
   */
  public getUserLogFilePath(userId?: string, fileName = 'user.log'): string {
    return join(this.getUserLogDir(userId), fileName);
  }

  /**
   * 获取临时诊断/打包 zip 文件的存放目录
   */
  public getDiagnosticsDir(): string {
    return this.ensureDir(join(this.getBaseLogDir(), 'diagnostics'));
  }
}
