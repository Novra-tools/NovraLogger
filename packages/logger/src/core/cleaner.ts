import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CleanLogsOptions, CleanLogsResult } from '../types';
import { PathResolver } from './path-resolver';

/** Maximum delete retry attempts for a single file */
const MAX_DELETE_RETRIES = 3;
/** Retry delay in milliseconds to handle unreleased file locks on Windows */
const RETRY_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely delete a single file with retry mechanism
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
 * Historical log and crash dump file cleaner
 */
export class LogCleaner {
  private pathResolver: PathResolver;

  constructor(pathResolver?: PathResolver) {
    this.pathResolver = pathResolver ?? new PathResolver();
  }

  /**
   * Recursively retrieve all log or target files under a directory
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
   * Retrieve and retain a specified number of recent .dmp crash dump files
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

    // Sort by modified time descending (newest first)
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
   * Perform log and historical file cleanup
   */
  public async clean(options: CleanLogsOptions = {}): Promise<CleanLogsResult> {
    let deletedCount = 0;
    let failedCount = 0;

    // 1. Determine target directories to clean
    const targetDirs: string[] = [];
    if (options.clearAll) {
      // Full wipe: include all subdirectories under the base log directory
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

    // 2. Scan and remove target log / archive files
    for (const dir of targetDirs) {
      const files = this.getTargetFiles(dir, options.clearAll ? ['.log', '.zip'] : ['.log']);
      for (const file of files) {
        if (maxAgeMs !== undefined && now - file.mtime < maxAgeMs) {
          // File has not exceeded retention age, skip
          continue;
        }

        const success = await safeDeleteFile(file.path);
        if (success) deletedCount++;
        else failedCount++;
      }
    }

    // 3. Clean excess crash dumps if directory is specified
    if (options.crashDumpsDir) {
      const retain = options.retainCrashDumps ?? 2;
      const dumpResult = await this.cleanCrashDumps(options.crashDumpsDir, retain);
      deletedCount += dumpResult.deleted;
      failedCount += dumpResult.failed;
    }

    return { deletedCount, failedCount };
  }

  /**
   * One-click wipe of all logs
   */
  public async clearAll(): Promise<CleanLogsResult> {
    return this.clean({ clearAll: true });
  }
}
