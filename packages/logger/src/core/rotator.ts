import {
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * 日志文件级联轮转器与大小控制器
 */
export class FileRotator {
  private maxFileSize: number;
  private maxFiles: number;
  private checkInterval: number;
  private writeCounters: Map<string, number> = new Map();

  constructor(
    maxFileSize = 10 * 1024 * 1024, // 默认 10MB
    maxFiles = 3,                   // 默认保留 3 份 (当前 + 2 历史轮转)
    checkInterval = 50              // 默认每写入 50 次检测一次大小
  ) {
    this.maxFileSize = maxFileSize;
    this.maxFiles = Math.max(1, maxFiles);
    this.checkInterval = Math.max(1, checkInterval);
  }

  /**
   * 写入节流计数判定，降低每次写文件都进行 `statSync` 的系统 I/O 损耗
   */
  public shouldCheck(filePath: string): boolean {
    const current = (this.writeCounters.get(filePath) ?? 0) + 1;
    this.writeCounters.set(filePath, current);
    return current === 1 || current % this.checkInterval === 0;
  }

  /**
   * 检查指定日志文件，若超出大小阈值则执行级联轮转
   * 
   * 示例（当 maxFiles = 3 时）：
   * 1. 检查 app.log 达到 10MB；
   * 2. 删除最旧的 app.2.log（若存在）；
   * 3. 将现有的 app.1.log 重命名为 app.2.log；
   * 4. 将当前 app.log 重命名为 app.1.log；
   * 5. 原路径释放，供下次写入生成全新的空 app.log。
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

      // 如果只允许保留 1 个文件，直接清空或删除当前文件
      if (this.maxFiles <= 1) {
        unlinkSync(filePath);
        return true;
      }

      const dir = dirname(filePath);
      const fileName = basename(filePath);
      // 提取去除 .log 后缀的基础名（例如 app）
      const baseWithoutExt = filePath.replace(/\.log$/, '');
      const maxRotationIndex = this.maxFiles - 1;

      // 级联向前推移历史归档文件
      for (let i = maxRotationIndex; i >= 1; i--) {
        const currentPath = `${baseWithoutExt}.${i}.log`;

        if (i === maxRotationIndex) {
          // 最旧的一份轮转文件直接移除，为前一个文件腾出位置
          if (existsSync(currentPath)) {
            try {
              unlinkSync(currentPath);
            } catch (err) {
              console.warn(`[@novra/logger] Failed to remove expired log: ${currentPath}`, err);
            }
          }
        } else {
          // 将 .i.log 移动为 .(i+1).log
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
              console.warn(`[@novra/logger] Failed to cascade rename ${currentPath} -> ${nextPath}`, err);
            }
          }
        }
      }

      // 将当前文件重命名为第一份历史轮转文件 .1.log
      const firstRotatedPath = `${baseWithoutExt}.1.log`;
      if (existsSync(firstRotatedPath)) {
        try {
          unlinkSync(firstRotatedPath);
        } catch {}
      }
      renameSync(filePath, firstRotatedPath);

      // 清理可能由于外部非正常变更遗留的多余历史日志
      this.cleanExcessiveLogFiles(dir, fileName.replace(/\.log$/, ''));
      return true;
    } catch (error) {
      console.warn(`[@novra/logger] Log rotation failed for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * 清扫指定目录下多余的历史日志文件，确保总数量不超过 maxFiles
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
        // 按修改时间降序排序（最新的在前，最旧的在后）
        matchedFiles.sort((a, b) => b.mtime - a.mtime);
        const toDelete = matchedFiles.slice(this.maxFiles);

        for (const file of toDelete) {
          try {
            unlinkSync(file.path);
          } catch (err) {
            console.warn(`[@novra/logger] Failed to delete excessive log: ${file.name}`, err);
          }
        }
      }
    } catch (error) {
      console.warn(`[@novra/logger] Clean excessive log files failed:`, error);
    }
  }
}
