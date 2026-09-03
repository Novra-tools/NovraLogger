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

  // 1. 渲染进程写入日志 IPC 通道
  const onWrite = async (_event: unknown, payload: RendererLogPayload) => {
    handler(payload);
  };
  ipcMain.handle('desklog:write', onWrite);
  ipcMain.handle('desklog:log-write', onWrite);
  ipcMain.handle('novra:log-write', onWrite); // 兼容旧前缀

  // 2. 获取用户或全局日志存储目录
  const onGetDir = async (_event: unknown, userId?: string) => {
    return logger.getUserLogDir(userId);
  };
  ipcMain.handle('desklog:dir', onGetDir);
  ipcMain.handle('desklog:log-dir', onGetDir);
  ipcMain.handle('novra:log-dir', onGetDir); // 兼容旧前缀

  // 3. 诊断包一键压缩打包通道 (供用户反馈或排障上传)
  const onPack = async (_event: unknown, options?: PackLogsOptions) => {
    return logger.packLogs(options);
  };
  ipcMain.handle('desklog:pack', onPack);
  ipcMain.handle('desklog:log-pack', onPack);
  ipcMain.handle('novra:log-pack', onPack); // 兼容旧前缀

  // 4. 清理日志通道 (支持按用户、按保留天数或全量清理)
  const onClean = async (_event: unknown, options?: CleanLogsOptions) => {
    return logger.cleanLogs(options);
  };
  ipcMain.handle('desklog:clean', onClean);
  ipcMain.handle('desklog:log-clean', onClean);
  ipcMain.handle('desklog:clear', onClean);
  ipcMain.handle('desklog:log-clear', onClean);
  ipcMain.handle('novra:log-clean', onClean); // 兼容旧前缀
  ipcMain.handle('novra:log-clear', onClean); // 兼容旧前缀

  // 5. 一键彻底清空本地所有日志
  const onClearAll = async () => {
    return logger.clearAllLogs();
  };
  ipcMain.handle('desklog:clear-all', onClearAll);
  ipcMain.handle('desklog:log-clear-all', onClearAll);
  ipcMain.handle('novra:log-clear-all', onClearAll); // 兼容旧前缀
}
