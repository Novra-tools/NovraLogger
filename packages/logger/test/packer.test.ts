import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogPacker } from '../src/core/packer';
import { PathResolver } from '../src/core/path-resolver';

describe('LogPacker', () => {
  const tempDir = join(__dirname, '.tmp-packer-test');

  beforeEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should package log files and metadata into a valid zip archive', async () => {
    const resolver = new PathResolver('test-app', tempDir);
    const packer = new LogPacker(resolver);

    const appDir = resolver.getAppLogDir();
    writeFileSync(join(appDir, 'test-app.log'), '2026/08/27 [INFO] app started\n');

    const result = await packer.pack({
      sourceDir: tempDir,
      metadata: { env: 'testing', build: '1.0.0' },
    });

    expect(existsSync(result.zipPath)).toBe(true);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);

    // 解压验证内容
    const zipBytes = readFileSync(result.zipPath);
    const unzipped = unzipSync(new Uint8Array(zipBytes));

    const fileKeys = Object.keys(unzipped);
    expect(fileKeys.some(k => k.includes('test-app.log'))).toBe(true);
    expect(fileKeys.some(k => k === 'metadata.json')).toBe(true);

    const metaString = Buffer.from(unzipped['metadata.json']).toString('utf8');
    const metaJson = JSON.parse(metaString);
    expect(metaJson.env).toBe('testing');
    expect(metaJson.build).toBe('1.0.0');
  });
});
