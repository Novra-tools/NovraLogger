import { contextBridge, ipcRenderer } from 'electron';
import type { CleanLogsOptions, PackLogsOptions, RendererLogPayload } from 'desklog';

const desklogBridge = {
  // Standard desklog IPC
  write: (payload: RendererLogPayload) => ipcRenderer.invoke('desklog:log-write', payload),
  getLogDir: (userId?: string) => ipcRenderer.invoke('desklog:log-dir', userId),
  packLogs: (options?: PackLogsOptions) => ipcRenderer.invoke('desklog:log-pack', options),
  cleanLogs: (options?: CleanLogsOptions) => ipcRenderer.invoke('desklog:log-clean', options),
  clearAllLogs: () => ipcRenderer.invoke('desklog:log-clear-all'),

  // Demo interactive helper APIs
  triggerMainLog: (level: string, message: string, data?: unknown) =>
    ipcRenderer.invoke('demo:main-log', { level, message, data }),
  openLogDir: (userId?: string) => ipcRenderer.invoke('demo:open-log-dir', userId),
  readRecentLogs: (userId?: string) => ipcRenderer.invoke('demo:read-recent-logs', userId),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('demo:show-item-in-folder', filePath),
};

contextBridge.exposeInMainWorld('desklog', desklogBridge);
contextBridge.exposeInMainWorld('novraLog', desklogBridge); // Backward compatibility

