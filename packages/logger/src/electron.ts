import type { Logger } from './core/logger';
import type {
  CleanLogsOptions,
  PackLogsOptions,
  RendererLogPayload,
} from './types';

/**
 * Minimal IpcMain abstract interface to avoid strong dependency on electron module types
 */
export interface MinimalIpcMain {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => any): void;
}

/**
 * Generate a pure function handler directly usable in Electron `ipcMain.handle` or custom channels
 */
export function createElectronLogHandler(logger: Logger) {
  return (payload: RendererLogPayload): void => {
    if (!payload || typeof payload !== 'object') return;

    logger.write({
      level: payload.level,
      module: payload.module,
      method: payload.method,
      message: payload.message,
      data: payload.data,
      error: payload.error,
      userId: payload.userId,
      tenantId: payload.tenantId,
      windowId: payload.windowId,
      timestamp: payload.createdAt,
    });
  };
}

/**
 * Register all log-related IPC handlers for the Electron main process
 * 
 * @param logger Current Logger instance
 * @param ipcMain Electron ipcMain instance (passed by host app to avoid direct Electron version coupling)
 */
export function registerElectronIpc(logger: Logger, ipcMain: MinimalIpcMain): void {
  const handler = createElectronLogHandler(logger);

  // 1. Renderer log write channel
  ipcMain.handle('novra:log-write', async (_event, payload: RendererLogPayload) => {
    handler(payload);
  });

  // 2. Get log directory channel
  ipcMain.handle('novra:log-dir', async (_event, userId?: string) => {
    return logger.getUserLogDir(userId);
  });

  // 3. Package & compress logs channel (for UI diagnostic feedback)
  ipcMain.handle('novra:log-pack', async (_event, options?: PackLogsOptions) => {
    return logger.packLogs(options);
  });

  // 4. Clean logs channel (supports user, retention days, or all logs)
  ipcMain.handle('novra:log-clean', async (_event, options?: CleanLogsOptions) => {
    return logger.cleanLogs(options);
  });
  ipcMain.handle('novra:log-clear', async (_event, options?: CleanLogsOptions) => {
    return logger.clearLogs(options);
  });
  ipcMain.handle('novra:log-clear-all', async () => {
    return logger.clearAllLogs();
  });
}
