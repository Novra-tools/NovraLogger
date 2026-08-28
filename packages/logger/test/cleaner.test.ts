import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogCleaner } from '../src/core/cleaner';
import { PathResolver } from '../src/core/path-resolver';

describe('LogCleaner', () => {
  const tempDir = join(__dirname, '.tmp-cleaner-test');

  beforeEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should clean all log files in directory', async () => {
    const resolver = new PathResolver('cleaner-app', tempDir);
    const cleaner = new LogCleaner(resolver);

    const appDir = resolver.getAppLogDir();
    const log1 = join(appDir, 'cleaner-app.log');
    const log2 = join(appDir, 'cleaner-app.1.log');
    writeFileSync(log1, 'log1');
    writeFileSync(log2, 'log2');

    const result = await cleaner.clean({ logDir: appDir });
    expect(result.deletedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(existsSync(log1)).toBe(false);
    expect(existsSync(log2)).toBe(false);
  });

  it('should support one-click clearAll to wipe all logs and user logs', async () => {
    const resolver = new PathResolver('cleaner-app', tempDir);
    const cleaner = new LogCleaner(resolver);

    const appLog = join(resolver.getAppLogDir(), 'app.log');
    const userLog1 = join(resolver.getUserLogDir('user_1'), 'user.log');
    const userLog2 = join(resolver.getUserLogDir('user_2'), 'user.log');
    const diagZip = join(resolver.getDiagnosticsDir(), 'diag.zip');

    writeFileSync(appLog, 'app');
    writeFileSync(userLog1, 'user1');
    writeFileSync(userLog2, 'user2');
    writeFileSync(diagZip, 'fake zip content');

    const result = await cleaner.clearAll();
    expect(result.deletedCount).toBe(4);
    expect(existsSync(appLog)).toBe(false);
    expect(existsSync(userLog1)).toBe(false);
    expect(existsSync(userLog2)).toBe(false);
    expect(existsSync(diagZip)).toBe(false);
  });

  it('should retain recent crash dumps', async () => {
    const resolver = new PathResolver('cleaner-app', tempDir);
    const cleaner = new LogCleaner(resolver);
    const dumpsDir = join(tempDir, 'crashDumps');
    mkdirSync(dumpsDir, { recursive: true });

    const dump1 = join(dumpsDir, 'crash1.dmp');
    const dump2 = join(dumpsDir, 'crash2.dmp');
    const dump3 = join(dumpsDir, 'crash3.dmp');

    writeFileSync(dump1, 'dump1');
    writeFileSync(dump2, 'dump2');
    writeFileSync(dump3, 'dump3');

    // retain 2 dumps
    const result = await cleaner.clean({
      crashDumpsDir: dumpsDir,
      retainCrashDumps: 2,
    });

    expect(result.deletedCount).toBe(1);
  });
});
