import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { zipSync, type Zippable } from 'fflate';
import type { PackLogsOptions, PackLogsResult } from '../types';
import { PathResolver } from './path-resolver';

/**
 * 纯 JS 日志打包与压缩导出器（无 native 编译依赖）
 */
export class LogPacker {
  private pathResolver: PathResolver;

  constructor(pathResolver?: PathResolver) {
    this.pathResolver = pathResolver ?? new PathResolver();
  }

  /**
   * 递归扫描指定目录下的所有待打包文件
   */
  private scanDirectory(
    dir: string,
    filter?: (fileName: string, fullPath: string) => boolean
  ): string[] {
    if (!existsSync(dir)) return [];
    const results: string[] = [];

    const walk = (currentDir: string): void => {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // 跳过 diagnostics/temp 自身，避免将之前的压缩包无限递归打包
          if (entry.name === 'diagnostics' || entry.name === 'temp') {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile()) {
          if (!filter || filter(entry.name, fullPath)) {
            results.push(fullPath);
          }
        }
      }
    };

    walk(dir);
    return results;
  }

  /**
   * 自动清理历史遗留的临时诊断 zip 文件，最多保留指定数量
   */
  private cleanPendingZips(diagnosticsDir: string, maxCount: number): void {
    try {
      if (!existsSync(diagnosticsDir)) return;
      const entries = readdirSync(diagnosticsDir);
      const zipFiles = entries
        .filter(name => name.endsWith('.zip'))
        .map(name => {
          const fullPath = join(diagnosticsDir, name);
          try {
            return { name, path: fullPath, mtime: statSync(fullPath).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((item): item is { name: string; path: string; mtime: number } => item !== null);

      if (zipFiles.length > maxCount) {
        zipFiles.sort((a, b) => b.mtime - a.mtime);
        const toDelete = zipFiles.slice(maxCount);
        for (const file of toDelete) {
          try {
            unlinkSync(file.path);
          } catch (err) {
            console.warn(`[@novra/logger] Failed to clean old diagnostic zip: ${file.name}`, err);
          }
        }
      }
    } catch (err) {
      console.warn('[@novra/logger] Clean pending zips failed:', err);
    }
  }

  /**
   * 将日志目录与诊断信息打包为 `.zip` 文件
   */
  public async pack(options: PackLogsOptions = {}): Promise<PackLogsResult> {
    const sourceDir = options.sourceDir
      ? options.sourceDir
      : options.userId
        ? this.pathResolver.getUserLogDir(options.userId)
        : this.pathResolver.getBaseLogDir();

    const diagnosticsDir = this.pathResolver.getDiagnosticsDir();
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const defaultZipName = `novra-logs-${options.userId ? `${options.userId}-` : ''}${timestamp}.zip`;

    const finalZipPath = options.outputZipPath
      ? options.outputZipPath
      : join(diagnosticsDir, defaultZipName);

    mkdirSync(dirname(finalZipPath), { recursive: true });

    // 扫描匹配的所有文件
    const filePaths = this.scanDirectory(sourceDir, options.filter);
    const zipData: Zippable = {};

    let fileCount = 0;
    for (const filePath of filePaths) {
      try {
        const relativePath = relative(sourceDir, filePath).replace(/\\/g, '/');
        const content = readFileSync(filePath);
        zipData[relativePath] = new Uint8Array(content);
        fileCount++;
      } catch (err) {
        console.warn(`[@novra/logger] Failed to read log file for packaging: ${filePath}`, err);
      }
    }

    // 若传入额外 metadata，则在 zip 根目录自动生成 metadata.json
    if (options.metadata) {
      const metaObject = {
        packagedAt: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        ...options.metadata,
      };
      const metaContent = Buffer.from(JSON.stringify(metaObject, null, 2), 'utf8');
      zipData['metadata.json'] = new Uint8Array(metaContent);
      fileCount++;
    }

    // 执行纯 JS 高性能压缩
    const compressedBuffer = zipSync(zipData, { level: 6 });
    writeFileSync(finalZipPath, Buffer.from(compressedBuffer));

    // 清理多余的历史临时 zip 导出包
    const maxPending = options.maxPendingZips ?? 3;
    this.cleanPendingZips(diagnosticsDir, maxPending);

    const stat = statSync(finalZipPath);
    return {
      zipPath: finalZipPath,
      size: stat.size,
      fileCount,
    };
  }
}
