import {
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Cascade log file rotator and file size controller
 */
export class FileRotator {
  private maxFileSize: number;
  private maxFiles: number;
  private checkInterval: number;
  private writeCounters: Map<string, number> = new Map();

  constructor(
    maxFileSize = 10 * 1024 * 1024, // Default 10MB
    maxFiles = 3,                   // Default 3 files (active + 2 rotated)
    checkInterval = 50              // Default check size every 50 writes
  ) {
    this.maxFileSize = maxFileSize;
    this.maxFiles = Math.max(1, maxFiles);
    this.checkInterval = Math.max(1, checkInterval);
  }

  /**
   * Write throttling check to reduce system I/O overhead from calling statSync on every write
   */
  public shouldCheck(filePath: string): boolean {
    const current = (this.writeCounters.get(filePath) ?? 0) + 1;
    this.writeCounters.set(filePath, current);
    return current === 1 || current % this.checkInterval === 0;
  }

  /**
   * Check target log file and trigger cascade rotation if file size exceeds threshold
   * 
   * Example (when maxFiles = 3):
   * 1. app.log reaches 10MB;
   * 2. Delete oldest app.2.log (if exists);
   * 3. Rename existing app.1.log -> app.2.log;
   * 4. Rename current app.log -> app.1.log;
   * 5. Original path is cleared for next append to create a fresh empty app.log.
   */
  public rotate(filePath: string): boolean {
    try {
      if (!existsSync(filePath)) {
        return false;
      }

      const fileStats = statSync(filePath);
      if (fileStats.size <= this.maxFileSize) {
        return false;
      }

      // If maxFiles is 1, simply remove the current file
      if (this.maxFiles <= 1) {
        unlinkSync(filePath);
        return true;
      }

      const dir = dirname(filePath);
      const fileName = basename(filePath);
      // Extract base name without .log extension (e.g. app)
      const baseWithoutExt = filePath.replace(/\.log$/, '');
      const maxRotationIndex = this.maxFiles - 1;

      // Cascade shift historical files forward
      for (let i = maxRotationIndex; i >= 1; i--) {
        const currentPath = `${baseWithoutExt}.${i}.log`;

        if (i === maxRotationIndex) {
          // Remove the oldest file to make room
          if (existsSync(currentPath)) {
            try {
              unlinkSync(currentPath);
            } catch (err) {
              console.warn(`[desklog] Failed to remove expired log: ${currentPath}`, err);
            }
          }
        } else {
          // Rename .i.log -> .(i+1).log
          const nextPath = `${baseWithoutExt}.${i + 1}.log`;
          if (existsSync(currentPath)) {
            if (existsSync(nextPath)) {
              try {
                unlinkSync(nextPath);
              } catch {}
            }
            try {
              renameSync(currentPath, nextPath);
            } catch (err) {
              console.warn(`[desklog] Failed to cascade rename ${currentPath} -> ${nextPath}`, err);
            }
          }
        }
      }

      // Rename current file to .1.log
      const firstRotatedPath = `${baseWithoutExt}.1.log`;
      if (existsSync(firstRotatedPath)) {
        try {
          unlinkSync(firstRotatedPath);
        } catch {}
      }
      renameSync(filePath, firstRotatedPath);

      // Clean any leftover excessive log files
      this.cleanExcessiveLogFiles(dir, fileName.replace(/\.log$/, ''));
      return true;
    } catch (error) {
      console.warn(`[desklog] Log rotation failed for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Clean excessive log files in directory to ensure total count does not exceed maxFiles
   */
  public cleanExcessiveLogFiles(logDir: string, basePrefix: string): void {
    try {
      if (!existsSync(logDir)) return;

      const entries = readdirSync(logDir);
      const matchedFiles = entries
        .filter(name => name.startsWith(basePrefix) && name.endsWith('.log'))
        .map(name => {
          const fullPath = join(logDir, name);
          try {
            return { name, path: fullPath, mtime: statSync(fullPath).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((item): item is { name: string; path: string; mtime: number } => item !== null);

      if (matchedFiles.length > this.maxFiles) {
        // Sort by modified time descending (newest first, oldest last)
        matchedFiles.sort((a, b) => b.mtime - a.mtime);
        const toDelete = matchedFiles.slice(this.maxFiles);

        for (const file of toDelete) {
          try {
            unlinkSync(file.path);
          } catch (err) {
            console.warn(`[desklog] Failed to delete excessive log: ${file.name}`, err);
          }
        }
      }
    } catch (error) {
      console.warn(`[desklog] Clean excessive log files failed:`, error);
    }
  }
}
