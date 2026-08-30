import { createRendererLogger } from 'novra-logger/renderer';

declare global {
  interface Window {
    novraLog: {
      write: (payload: unknown) => Promise<void>;
      getLogDir: (userId?: string) => Promise<string>;
      packLogs: (options?: unknown) => Promise<{ zipPath: string; size: number; fileCount: number }>;
      cleanLogs: (options?: unknown) => Promise<{ deletedCount: number; failedCount: number }>;
      clearAllLogs: () => Promise<{ deletedCount: number; failedCount: number }>;
      triggerMainLog: (level: string, message: string, data?: unknown) => Promise<void>;
      openLogDir: (userId?: string) => Promise<string>;
      readRecentLogs: (userId?: string) => Promise<string>;
      showItemInFolder: (filePath: string) => Promise<boolean>;
    };
  }
}

let currentUserId: string | undefined = undefined;

// Initialize Renderer Process Logger
const rendererLogger = createRendererLogger({
  send: (payload) => window.novraLog.write(payload),
  getUserId: () => currentUserId,
  defaultModule: 'DemoRenderer',
  enableConsole: true,
});

const terminal = document.getElementById('logTerminal') as HTMLPreElement;
const pathBadge = document.getElementById('currentLogDir') as HTMLDivElement;
const userSelect = document.getElementById('userSelect') as HTMLSelectElement;
const packResultBox = document.getElementById('packResult') as HTMLDivElement;

async function refreshLiveLogs() {
  try {
    const content = await window.novraLog.readRecentLogs(currentUserId);
    terminal.textContent = content;
    terminal.scrollTop = terminal.scrollHeight;

    const logDir = await window.novraLog.getLogDir(currentUserId);
    pathBadge.textContent = `📁 ${logDir}`;
  } catch (err) {
    terminal.textContent = `Error loading logs: ${String(err)}`;
  }
}

// Handle active user switching
userSelect.addEventListener('change', () => {
  currentUserId = userSelect.value || undefined;
  refreshLiveLogs();
});

// 1. Main Process Log Buttons
document.getElementById('btnMainInfo')?.addEventListener('click', async () => {
  await window.novraLog.triggerMainLog('info', 'Main service cycle finished', { load: '0.12' });
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnMainWarn')?.addEventListener('click', async () => {
  await window.novraLog.triggerMainLog('warn', 'High memory consumption detected in background worker', { heapUsedMB: 480 });
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnMainError')?.addEventListener('click', async () => {
  await window.novraLog.triggerMainLog('error', 'Database worker connection timeout after 5000ms', { timeoutMs: 5000 });
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnMainMask')?.addEventListener('click', async () => {
  await window.novraLog.triggerMainLog('info', 'App configuration loaded with sensitive credentials', {
    password: 'root_super_password_123',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    phone: '13800138000',
    email: 'admin@novratools.com',
  });
  setTimeout(refreshLiveLogs, 50);
});

// 2. Renderer Process Log Buttons
document.getElementById('btnRenderInfo')?.addEventListener('click', () => {
  const uiLogger = rendererLogger.scope('ChatView', 'click');
  uiLogger.info('User clicked send message button', { inputLength: 32, timestamp: Date.now() });
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnRenderWarn')?.addEventListener('click', () => {
  const netLogger = rendererLogger.scope('HttpTransport', 'retry');
  netLogger.warn('Gateway 504 timeout, retrying request in 1000ms', { attempt: 2, endpoint: '/api/v1/sync' });
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnRenderError')?.addEventListener('click', () => {
  const mediaLogger = rendererLogger.scope('MediaRenderer', 'paint');
  mediaLogger.error('Failed to decode WebRTC video frame', new Error('H.264 hardware decode driver crashed'));
  setTimeout(refreshLiveLogs, 50);
});

document.getElementById('btnRenderMask')?.addEventListener('click', () => {
  const authLogger = rendererLogger.scope('AuthForm', 'submit');
  authLogger.info('User submitted login credentials', {
    username: 'novra_user',
    password: 'user_plain_password_abc',
    phone: '13988889999',
    email: 'hello@novratools.com',
    authorization: 'Bearer secret_access_token_123456',
  });
  setTimeout(refreshLiveLogs, 50);
});

// 3. Packaging & Diagnostics
document.getElementById('btnPackLogs')?.addEventListener('click', async () => {
  packResultBox.style.display = 'block';
  packResultBox.textContent = 'Compressing logs...';

  try {
    const result = await window.novraLog.packLogs({
      userId: currentUserId,
      metadata: {
        appName: 'novra-electron-demo',
        userTriggered: true,
        clientTime: new Date().toISOString(),
      },
    });

    packResultBox.innerHTML = `
      ✅ <strong>ZIP Package Created!</strong><br>
      <strong>File:</strong> ${result.zipPath}<br>
      <strong>Size:</strong> ${(result.size / 1024).toFixed(2)} KB (${result.fileCount} files)<br>
      <button class="btn btn-outline" style="margin-top: 8px;" id="btnRevealZip">🔍 Reveal ZIP in Folder</button>
    `;

    document.getElementById('btnRevealZip')?.addEventListener('click', () => {
      window.novraLog.showItemInFolder(result.zipPath);
    });
  } catch (err) {
    packResultBox.textContent = `Packaging failed: ${String(err)}`;
  }
});

document.getElementById('btnOpenFolder')?.addEventListener('click', () => {
  window.novraLog.openLogDir(currentUserId);
});

// Clear current user logs
document.getElementById('btnClearUserLogs')?.addEventListener('click', async () => {
  const res = await window.novraLog.cleanLogs({ userId: currentUserId });
  packResultBox.style.display = 'block';
  packResultBox.textContent = `Cleaned ${res.deletedCount} log files for current context (${res.failedCount} failed).`;
  setTimeout(refreshLiveLogs, 100);
});

// Wipe all local logs
document.getElementById('btnClearAllLogs')?.addEventListener('click', async () => {
  const res = await window.novraLog.clearAllLogs();
  packResultBox.style.display = 'block';
  packResultBox.textContent = `💥 Wiped ALL ${res.deletedCount} local log files (${res.failedCount} failed).`;
  setTimeout(refreshLiveLogs, 100);
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', () => {
  refreshLiveLogs();
});

// Initial load
refreshLiveLogs();
setInterval(refreshLiveLogs, 3000);
