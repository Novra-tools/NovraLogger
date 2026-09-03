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
 * Pure JS log packaging and compression exporter (zero native compile dependencies)
 */
export class LogPacker {
  private pathResolver: PathResolver;

  constructor(pathResolver?: PathResolver) {
    this.pathResolver = pathResolver ?? new PathResolver();
  }

  /**
   * Recursively scan for all candidate log files under a directory
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
          // Skip diagnostics/temp folders to prevent recursive self-packaging
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
   * Purge older temporary diagnostic zip files, keeping up to maxCount
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
            console.warn(`[desklog] Failed to clean old diagnostic zip: ${file.name}`, err);
          }
        }
      }
    } catch (err) {
      console.warn('[desklog] Clean pending zips failed:', err);
    }
  }

  /**
   * Package log directory and diagnostic metadata into a `.zip` archive
   */
  public async pack(options: PackLogsOptions = {}): Promise<PackLogsResult> {
    const sourceDir = options.sourceDir
      ? options.sourceDir
      : options.userId
        ? this.pathResolver.getUserLogDir(options.userId)
        : this.pathResolver.getBaseLogDir();

    const diagnosticsDir = this.pathResolver.getDiagnosticsDir();
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const defaultZipName = `desklog-${options.userId ? `${options.userId}-` : ''}${timestamp}.zip`;

    const finalZipPath = options.outputZipPath
      ? options.outputZipPath
      : join(diagnosticsDir, defaultZipName);

    mkdirSync(dirname(finalZipPath), { recursive: true });

    // Scan matching files
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
        console.warn(`[desklog] Failed to read log file for packaging: ${filePath}`, err);
      }
    }

    // Automatically generate metadata.json in the zip root if metadata is provided
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

    // Execute pure JS high-performance compression
    const compressedBuffer = zipSync(zipData, { level: 6 });
    writeFileSync(finalZipPath, Buffer.from(compressedBuffer));

    // Clean up excessive older diagnostic zips
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
