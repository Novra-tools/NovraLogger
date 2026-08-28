import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileRotator } from '../src/core/rotator';

describe('FileRotator', () => {
  const tempDir = join(__dirname, '.tmp-rotator-test');
  const logFile = join(tempDir, 'app.log');

  beforeEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should not rotate if file is under maxFileSize', () => {
    const rotator = new FileRotator(1024, 3, 1);
    writeFileSync(logFile, 'small log content');

    const rotated = rotator.rotate(logFile);
    expect(rotated).toBe(false);
    expect(existsSync(logFile)).toBe(true);
    expect(existsSync(join(tempDir, 'app.1.log'))).toBe(false);
  });

  it('should cascade rotate files when file size exceeds limit', () => {
    // maxFileSize = 10 bytes, maxFiles = 3 (app.log, app.1.log, app.2.log)
    const rotator = new FileRotator(10, 3, 1);

    // 第一次超出
    writeFileSync(logFile, 'First content that is very long');
    rotator.rotate(logFile);

    expect(existsSync(join(tempDir, 'app.1.log'))).toBe(true);
    expect(readFileSync(join(tempDir, 'app.1.log'), 'utf8')).toBe('First content that is very long');

    // 第二次超出
    writeFileSync(logFile, 'Second content that is also long');
    rotator.rotate(logFile);

    expect(existsSync(join(tempDir, 'app.1.log'))).toBe(true);
    expect(existsSync(join(tempDir, 'app.2.log'))).toBe(true);
    expect(readFileSync(join(tempDir, 'app.1.log'), 'utf8')).toBe('Second content that is also long');
    expect(readFileSync(join(tempDir, 'app.2.log'), 'utf8')).toBe('First content that is very long');

    // 第三次超出（app.2.log 应当被剔除，滚动为新的 app.2.log）
    writeFileSync(logFile, 'Third content long');
    rotator.rotate(logFile);

    expect(readFileSync(join(tempDir, 'app.1.log'), 'utf8')).toBe('Third content long');
    expect(readFileSync(join(tempDir, 'app.2.log'), 'utf8')).toBe('Second content that is also long');
    expect(existsSync(join(tempDir, 'app.3.log'))).toBe(false);
  });
});
