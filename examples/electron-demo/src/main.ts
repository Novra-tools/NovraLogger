import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createLogger,
  registerElectronIpc,
  type LogLevel,
} from 'desklog';

let mainWindow: BrowserWindow | null = null;

// 1. Initialize main process desklog
const logger = createLogger({
  appName: 'desklog-electron-demo',
  logDir: join(app.getPath('userData'), 'logs'),
  level: 'debug',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 3,
  enableConsole: true,
});

logger.info('Electron main process starting up', {
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  platform: process.platform,
  arch: process.arch,
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: 'desklog — Electron Interactive Demo',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 2. Register standard desklog IPC
registerElectronIpc(logger, ipcMain);

// 3. Register Demo interactive helper IPC
ipcMain.handle('demo:main-log', async (_event, payload: { level: LogLevel; message: string; data?: unknown }) => {
  const scope = logger.scope('MainService', 'demoTask');
  switch (payload.level) {
    case 'debug':
      scope.debug(payload.message, payload.data);
      break;
    case 'info':
      scope.info(payload.message, payload.data);
      break;
    case 'warn':
      scope.warn(payload.message, payload.data);
      break;
    case 'error':
      scope.error(payload.message, payload.data);
      break;
    case 'fatal':
      scope.fatal(payload.message, payload.data);
      break;
  }
  return { success: true };
});

ipcMain.handle('demo:open-log-dir', async (_event, userId?: string) => {
  const targetDir = logger.getUserLogDir(userId);
  await shell.openPath(targetDir);
  return targetDir;
});

ipcMain.handle('demo:show-item-in-folder', async (_event, filePath: string) => {
  if (existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('demo:read-recent-logs', async (_event, userId?: string) => {
  try {
    const targetFilePath = userId
      ? join(logger.getUserLogDir(userId), 'user.log')
      : join(logger.getLogDir(), 'app', 'desklog-electron-demo.log');

    if (!existsSync(targetFilePath)) {
      return `(Log file not created yet: ${targetFilePath})`;
    }

    const content = readFileSync(targetFilePath, 'utf8');
    const lines = content.trim().split('\n');
    // Return the most recent 50 lines
    return lines.slice(-50).join('\n');
  } catch (err) {
    return `Error reading log file: ${String(err)}`;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
