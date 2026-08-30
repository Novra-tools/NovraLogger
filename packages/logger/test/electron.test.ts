import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/core/logger';
import { createElectronLogHandler, registerElectronIpc } from '../src/electron';
import type { RendererLogPayload } from '../src/types';

describe('Electron Adapter', () => {
  const tempDir = join(__dirname, '.tmp-electron-test');

  beforeEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should process renderer log payload and write to disk', () => {
    const logger = createLogger({
      appName: 'electron-app',
      logDir: tempDir,
      level: 'debug',
      enableConsole: false,
    });

    const handler = createElectronLogHandler(logger);
    const payload: RendererLogPayload = {
      level: 'info',
      module: 'RendererWindow',
      method: 'onMount',
      message: 'Window mounted successfully',
      data: { token: 'my_secret_token' },
      createdAt: Date.now(),
    };

    handler(payload);

    const logPath = join(tempDir, 'app', 'electron-app.log');
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('[RendererWindow] [onMount]');
    expect(content).toContain('Window mounted successfully');
    expect(content).toContain('"token":"[token]"');
  });

  it('should register IPC handlers to mock ipcMain', async () => {
    const logger = createLogger({
      appName: 'electron-app',
      logDir: tempDir,
      level: 'debug',
      enableConsole: false,
    });

    const channels: Record<string, Function> = {};
    const mockIpcMain = {
      handle: (channel: string, listener: Function) => {
        channels[channel] = listener;
      },
    };

    registerElectronIpc(logger, mockIpcMain);

    expect(channels['novra:log-write']).toBeDefined();
    expect(channels['novra:log-dir']).toBeDefined();
    expect(channels['novra:log-pack']).toBeDefined();
    expect(channels['novra:log-clean']).toBeDefined();

    // Trigger write test
    await channels['novra:log-write']({}, {
      level: 'warn',
      module: 'IpcTest',
      message: 'IPC message received',
      createdAt: Date.now(),
    });

    const logPath = join(tempDir, 'app', 'electron-app.log');
    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('[IpcTest]');
    expect(content).toContain('IPC message received');
  });
});
