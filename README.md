# desklog — Universal Log Collection & Management Library for Electron, Tauri & Node.js

[![npm version](https://img.shields.io/npm/v/desklog?style=flat-square)](https://www.npmjs.com/package/desklog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE)
[![X (Twitter)](https://img.shields.io/badge/X-@novratools-blue?style=flat-square&logo=x)](https://x.com/novratools)

[English](https://github.com/Novra-tools/NovraLogger/blob/main/README.md) | [简体中文](https://github.com/Novra-tools/NovraLogger/blob/main/README.zh-CN.md) | [日本語](https://github.com/Novra-tools/NovraLogger/blob/main/README.ja.md) | [한국어](https://github.com/Novra-tools/NovraLogger/blob/main/README.ko.md) | [Español](https://github.com/Novra-tools/NovraLogger/blob/main/README.es.md)

**desklog** is a universal, zero-host-dependency log collection and management library specifically designed for **Electron**, **Tauri**, and **Node.js** applications. It delivers a full-featured logging ecosystem out-of-the-box: high-performance cascade file rotation, automatic expired log purging, strict disk space bounding, recursive sensitive data masking, multi-user/tenant directory isolation, one-click local log wipe, and one-call pure-JS ZIP diagnostic log packaging.

---

## Key Features

- **Built for Electron, Tauri & Node.js**: Zero-host-dependency architecture without bundling or hardcoding `electron` or `@tauri-apps/api`. No native C++ compilation (no `node-gyp` issues).
- **High-Performance Cascade Log Rotation**: Automatically rolls files (`app.log` &rarr; `app.1.log` &rarr; `app.2.log`) when size limit is reached.
- **Automatic Expired Log Purging & Bounded Disk Footprint**:
  - Automatically unlinks and deletes oldest archive files when count exceeds `maxFiles`.
  - Guarantees strict disk space boundaries (`Total Disk Space <= maxFileSize * maxFiles`), preventing uncontrolled disk consumption.
  - Built-in write-throttled size inspection (`checkInterval`) to minimize file system I/O overhead.
- **One-Click Local Log Cleanup**:
  - `logger.clearLogs()` / `logger.cleanLogs()`: Easily purge user-specific or aged logs.
  - `logger.clearAllLogs()`: One-click complete wipe of all logs across all user directories and diagnostic archives.
  - Crashpad `.dmp` crash dump retention management with retry logic for Windows file lock tolerances.
- **Automated Sensitive Data Masking**: Out-of-the-box filtering for tokens, passwords, authorization headers, phone numbers, and URL query tokens with circular reference safety.
- **One-Call Diagnostic ZIP Packaging**: Compresses log files and system metadata into a `.zip` archive on demand for user feedback and error upload pipelines.
- **Multi-Tenant / User Isolation**: Automatically isolates application logs (`logs/app/`) from user-specific logs (`logs/users/<userId>/`).
- **First-Class Desktop Support**: Provides clean, non-intrusive adapters for Electron (Main & Renderer) and Tauri.
- **Dual Format & Full TypeScript**: Ships with native ESM and CommonJS builds with complete `.d.ts` type declarations.

---

## Installation

```bash
npm install desklog
# or
pnpm add desklog
# or
yarn add desklog
```

---

## Quick Start

### 1. Standard Node.js / CLI / Backend

```typescript
import { createLogger } from 'desklog';

// 1. Initialize logger
const logger = createLogger({
  appName: 'my-backend',
  logDir: './logs',              // Defaults to OS appData or ./logs
  level: 'debug',                // 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  maxFileSize: 10 * 1024 * 1024, // 10MB per file
  maxFiles: 3,                   // Keeps active file + 2 rotated backups (Strictly capped at 30MB total)
  checkInterval: 50,             // Checks file size every 50 writes for high performance
});

// 2. Simple logging
logger.info('Server started on port 3000');

// 3. Scoped logging with structured data and automatic masking
const authLog = logger.scope('AuthModule', 'login');
authLog.info('User authenticated', {
  userId: 'user_1001',
  token: 'eyJhbGciOiJIUzI1NiIsIn...', // Automatically masked as "[token]"
});
```

---

### 2. Electron Application Setup

#### Main Process (`main.ts`)

```typescript
import { app, ipcMain } from 'electron';
import { createLogger, registerElectronIpc } from 'desklog';

// Initialize the main logger
const logger = createLogger({
  appName: 'my-electron-app',
  logDir: `${app.getPath('userData')}/logs`,
});

// Register IPC handlers ('desklog:log-write', 'desklog:log-pack', 'desklog:log-clean', 'desklog:log-clear-all')
registerElectronIpc(logger, ipcMain);
```

#### Preload Script (`preload.ts`)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desklog', {
  write: (payload: unknown) => ipcRenderer.invoke('desklog:log-write', payload),
  pack: (options?: unknown) => ipcRenderer.invoke('desklog:log-pack', options),
  clean: (options?: unknown) => ipcRenderer.invoke('desklog:log-clean', options),
  clearAll: () => ipcRenderer.invoke('desklog:log-clear-all'),
});
```

#### Renderer Process (`renderer.ts` / React / Vue)

```typescript
import { createRendererLogger } from 'desklog/renderer';

const rendererLogger = createRendererLogger({
  send: (payload) => (window as any).desklog.write(payload),
  getUserId: () => getCurrentUserId(), // Optional: automatically isolates user logs
});

// Scoped UI logger
const chatLogger = rendererLogger.scope('ChatUI', 'sendMessage');
chatLogger.info('Sending message to conversation', { convId: 'conv_889' });
```

---

### 3. Log Rotation & Disk Space Control

`desklog` features an automatic cascade rotation mechanism:

1. When `app.log` exceeds `maxFileSize` (e.g. 10MB), it rolls `app.1.log` &rarr; `app.2.log`, and `app.log` &rarr; `app.1.log`.
2. Any older archive beyond `maxFiles` (e.g. `app.3.log`) is **immediately and permanently unlinked from disk**, guaranteeing your app never exceeds the configured disk ceiling (`maxFileSize * maxFiles`).
3. To maximize throughput, file size is checked on a throttled interval (`checkInterval`, default: 50 writes), preventing unnecessary filesystem `stat` overhead.

---

### 4. One-Click Local Log Cleanup

Clean expired logs, wipe user logs, or completely clear all application logs with one call:

```typescript
import { createLogger } from 'desklog';

const logger = createLogger();

// 1. Completely wipe all local application logs, user-isolated logs, and diagnostic archives
const wipeResult = await logger.clearAllLogs();
console.log(`Successfully deleted ${wipeResult.deletedCount} files.`);

// 2. Clear only the current user's isolated logs
await logger.clearLogs({ userId: 'user_1001' });

// 3. Clean logs older than 7 days, retaining up to 2 recent crash dumps
await logger.cleanLogs({
  maxAgeDays: 7,
  retainCrashDumps: 2,
  crashDumpsDir: app.getPath('crashDumps'),
});
```

---

### 5. One-Call Diagnostic ZIP Packaging

When users report an issue, package local logs and system metadata into a `.zip` file with a single call:

```typescript
import { createLogger } from 'desklog';

const logger = createLogger();

// Package logs
const { zipPath, size, fileCount } = await logger.packLogs({
  userId: 'current_user_id', // Optional: pack only this user's logs
  metadata: {
    appVersion: '1.2.0',
    os: process.platform,
    issueDescription: 'Video stream black screen on startup',
  },
});

console.log(`Diagnostics ZIP ready: ${zipPath} (${size} bytes, ${fileCount} files)`);
// -> Upload zipPath to your backend / S3 / OSS
```

---

## Configuration Options

`createLogger(options)` accepts the following configuration:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `appName` | `string` | `'desklog-app'` | Application identifier. Used for the default log directory and filename. |
| `logDir` | `string` | *Auto-detected* | Target directory for log files. Defaults to OS AppData/Logs directory or `./logs`. |
| `level` | `LogLevel` | `'info'` (prod) / `'debug'` (dev) | Lowest log level to record (`'debug'`, `'info'`, `'warn'`, `'error'`, `'fatal'`). |
| `maxFileSize` | `number` | `10485760` (10MB) | Maximum file size in bytes before triggering rotation. |
| `maxFiles` | `number` | `3` | Maximum number of log files to retain per type (active + rotated). Excess files are automatically purged. |
| `checkInterval` | `number` | `50` | Write count interval between size checks to minimize disk I/O. |
| `maskSensitive` | `boolean` | `true` | Whether to automatically mask passwords, tokens, phones, etc. |
| `sensitiveKeys` | `string[]` | `[]` | Additional keys to treat as sensitive. |
| `enableConsole` | `boolean` | `true` (dev) / `false` (prod) | Whether to mirror logs to standard console output. |
| `formatter` | `Function` | *Default Formatter* | Custom log entry line formatter. |

---

## Support & Community

- **Official Website & X (Twitter)**: [https://x.com/novratools](https://x.com/novratools)
- **GitHub Repository**: [https://github.com/Novra-tools/NovraLogger](https://github.com/Novra-tools/NovraLogger)
- **GitHub Issues**: [Issues Tracker](https://github.com/Novra-tools/NovraLogger/issues)

---

## License

[MIT](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE) © 2026 Novra Tools
