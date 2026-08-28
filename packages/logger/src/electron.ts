import type { Logger } from './core/logger';
import type {
  CleanLogsOptions,
  PackLogsOptions,
  RendererLogPayload,
} from './types';

/**
 * 最小化 IpcMain 抽象接口，避免强依赖 electron 模块类型
 */
export interface MinimalIpcMain {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => any): void;
}

/**
 * 生成可直接用于 Electron `ipcMain.handle` 或自定义通道消费的纯函数处理器
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
 * 为 Electron 主进程一键注册全部日志相关 IPC 处理程序
 * 
 * @param logger 当前 Logger 实例
 * @param ipcMain Electron 的 ipcMain 实例（由宿主应用传入，避免本库与 electron 产生版本依赖）
 */
export function registerElectronIpc(logger: Logger, ipcMain: MinimalIpcMain): void {
  const handler = createElectronLogHandler(logger);

  // 1. 渲染进程日志写入通道
  ipcMain.handle('novra:log-write', async (_event, payload: RendererLogPayload) => {
    handler(payload);
  });

  // 2. 获取日志目录通道
  ipcMain.handle('novra:log-dir', async (_event, userId?: string) => {
    return logger.getUserLogDir(userId);
  });

  // 3. 打包压缩日志通道（供 UI 诊断反馈调用）
  ipcMain.handle('novra:log-pack', async (_event, options?: PackLogsOptions) => {
    return logger.packLogs(options);
  });

  // 4. 清理日志通道 (支持按用户、按天数或全量清理)
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
