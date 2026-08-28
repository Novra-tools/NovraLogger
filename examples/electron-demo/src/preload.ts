import { contextBridge, ipcRenderer } from 'electron';
import type { CleanLogsOptions, PackLogsOptions, RendererLogPayload } from 'novra-logger';

contextBridge.exposeInMainWorld('novraLog', {
  // 标准 novra-logger IPC
  write: (payload: RendererLogPayload) => ipcRenderer.invoke('novra:log-write', payload),
  getLogDir: (userId?: string) => ipcRenderer.invoke('novra:log-dir', userId),
  packLogs: (options?: PackLogsOptions) => ipcRenderer.invoke('novra:log-pack', options),
  cleanLogs: (options?: CleanLogsOptions) => ipcRenderer.invoke('novra:log-clean', options),
  clearAllLogs: () => ipcRenderer.invoke('novra:log-clear-all'),

  // Demo 辅助交互 API
  triggerMainLog: (level: string, message: string, data?: unknown) =>
    ipcRenderer.invoke('demo:main-log', { level, message, data }),
  openLogDir: (userId?: string) => ipcRenderer.invoke('demo:open-log-dir', userId),
  readRecentLogs: (userId?: string) => ipcRenderer.invoke('demo:read-recent-logs', userId),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('demo:show-item-in-folder', filePath),
});
