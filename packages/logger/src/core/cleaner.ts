import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CleanLogsOptions, CleanLogsResult } from '../types';
import { PathResolver } from './path-resolver';

/** 单个文件删除最大重试次数 */
const MAX_DELETE_RETRIES = 3;
/** 重试间隔（毫秒），应对 Windows 平台下文件句柄暂未释放的问题 */
const RETRY_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全删除单个文件，包含重试机制
 */
async function safeDeleteFile(filePath: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_DELETE_RETRIES; attempt++) {
    try {
      if (!existsSync(filePath)) return true;
      unlinkSync(filePath);
      return true;
    } catch {
      if (attempt < MAX_DELETE_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return false;
}

/**
 * 历史日志与崩溃转储文件清理器
 */
export class LogCleaner {
  private pathResolver: PathResolver;

  constructor(pathResolver?: PathResolver) {
    this.pathResolver = pathResolver ?? new PathResolver();
  }

  /**
   * 递归检索目录下的所有日志或待清理文件
   */
  private getTargetFiles(dir: string, extensions = ['.log', '.zip']): Array<{ path: string; mtime: number }> {
    if (!existsSync(dir)) return [];
    const files: Array<{ path: string; mtime: number }> = [];

    const walk = (currentDir: string): void => {
      try {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const isTargetExt = extensions.some(ext => entry.name.toLowerCase().endsWith(ext));
            if (isTargetExt) {
              try {
                files.push({ path: fullPath, mtime: statSync(fullPath).mtimeMs });
              } catch {}
            }
          }
        }
      } catch {}
    };

    walk(dir);
    return files;
  }

  /**
   * 检索并保留指定数量的最新 .dmp 崩溃转储文件
   */
  private async cleanCrashDumps(
    crashDumpsDir: string,
    retainCount: number
  ): Promise<{ deleted: number; failed: number }> {
    if (!existsSync(crashDumpsDir)) return { deleted: 0, failed: 0 };

    const dumpFiles: Array<{ path: string; mtime: number }> = [];
    const walk = (dir: string): void => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dmp')) {
            try {
              dumpFiles.push({ path: fullPath, mtime: statSync(fullPath).mtimeMs });
            } catch {}
          }
        }
      } catch {}
    };

    walk(crashDumpsDir);

    // 按修改时间降序排序
    dumpFiles.sort((a, b) => b.mtime - a.mtime);
    const expiredDumps = dumpFiles.slice(retainCount);

    let deleted = 0;
    let failed = 0;
    for (const dump of expiredDumps) {
      const ok = await safeDeleteFile(dump.path);
      if (ok) deleted++;
      else failed++;
    }

    return { deleted, failed };
  }

  /**
   * 执行日志及历史文件清理
   */
  public async clean(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    let deletedCount = 0;
    let failedCount = 0;

    // 1. 确定需要清理的目标目录列表
    const targetDirs: string[] = [];
    if (options.clearAll) {
      // 全量一键清理：包含基础根目录下的所有子目录
      targetDirs.push(this.pathResolver.getBaseLogDir());
    } else if (options.logDir) {
      targetDirs.push(options.logDir);
    } else if (options.userId) {
      targetDirs.push(this.pathResolver.getUserLogDir(options.userId));
    } else {
      targetDirs.push(this.pathResolver.getAppLogDir());
    }

    const now = Date.now();
    const maxAgeMs = options.maxAgeDays ? options.maxAgeDays * 24 * 60 * 60 * 1000 : undefined;

    // 2. 遍历扫描并删除目标日志/压缩包文件
    for (const dir of targetDirs) {
      const files = this.getTargetFiles(dir, options.clearAll ? ['.log', '.zip'] : ['.log']);
      for (const file of files) {
        if (maxAgeMs !== undefined && now - file.mtime < maxAgeMs) {
          // 未超过最大保留天数，跳过
          continue;
        }

        const success = await safeDeleteFile(file.path);
        if (success) deletedCount++;
        else failedCount++;
      }
    }

    // 3. 若配置了崩溃转储目录，清理多余的 .dmp
    if (options.crashDumpsDir) {
      const retain = options.retainCrashDumps ?? 2;
      const dumpResult = await this.cleanCrashDumps(options.crashDumpsDir, retain);
      deletedCount += dumpResult.deleted;
      failedCount += dumpResult.failed;
    }

    return { deletedCount, failedCount };
  }

  /**
   * 一键清空全部日志
   */
  public async clearAll(): Promise<CleanLogsResult> {
    return this.clean({ clearAll: true });
  }
}
