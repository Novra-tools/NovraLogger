import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/core/logger';

describe('Logger Core', () => {
  const tempDir = join(__dirname, '.tmp-logger-test');

  beforeEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should write formatted logs to disk', () => {
    const logger = createLogger({
      appName: 'my-app',
      logDir: tempDir,
      level: 'debug',
      enableConsole: false,
    });

    logger.info('System initialization complete');
    const mainLogPath = join(tempDir, 'app', 'my-app.log');

    expect(existsSync(mainLogPath)).toBe(true);
    const content = readFileSync(mainLogPath, 'utf8');
    expect(content).toContain('[INFO]');
    expect(content).toContain('[my-app]');
    expect(content).toContain('System initialization complete');
  });

  it('should support scoped loggers and object options', () => {
    const logger = createLogger({
      appName: 'my-app',
      logDir: tempDir,
      level: 'debug',
      enableConsole: false,
    });

    const scoped = logger.scope('ChatModule', 'sendMessage');
    scoped.info('Message sent successfully', { msgId: '1001', token: 'secret_123' });

    const mainLogPath = join(tempDir, 'app', 'my-app.log');
    const content = readFileSync(mainLogPath, 'utf8');

    expect(content).toContain('[ChatModule] [sendMessage]');
    expect(content).toContain('Message sent successfully');
    expect(content).toContain('"token":"[token]"');
  });

  it('should filter logs below threshold level', () => {
    const logger = createLogger({
      appName: 'my-app',
      logDir: tempDir,
      level: 'warn', // Only record warn/error/fatal
      enableConsole: false,
    });

    logger.debug('This debug should be ignored');
    logger.info('This info should be ignored');
    logger.warn('This warn should be recorded');

    const mainLogPath = join(tempDir, 'app', 'my-app.log');
    const content = readFileSync(mainLogPath, 'utf8');

    expect(content).not.toContain('This debug should be ignored');
    expect(content).not.toContain('This info should be ignored');
    expect(content).toContain('This warn should be recorded');
  });

  it('should separate user logs when userId is specified', () => {
    const logger = createLogger({
      appName: 'my-app',
      logDir: tempDir,
      level: 'debug',
      enableConsole: false,
    });

    logger.write({
      level: 'info',
      module: 'auth',
      message: 'User logged in',
      userId: 'user_9988',
    });

    const userLogPath = join(tempDir, 'users', 'user_9988', 'user.log');
    expect(existsSync(userLogPath)).toBe(true);

    const content = readFileSync(userLogPath, 'utf8');
    expect(content).toContain('User logged in');
  });
});
