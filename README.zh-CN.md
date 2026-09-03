# desklog — 专为 Electron、Tauri 与 Node.js 打造的通用日志收集与管理库

[![npm version](https://img.shields.io/npm/v/desklog?style=flat-square)](https://www.npmjs.com/package/desklog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE)
[![X (Twitter)](https://img.shields.io/badge/X-@novratools-blue?style=flat-square&logo=x)](https://x.com/novratools)

[English](https://github.com/Novra-tools/NovraLogger/blob/main/README.md) | [简体中文](https://github.com/Novra-tools/NovraLogger/blob/main/README.zh-CN.md) | [日本語](https://github.com/Novra-tools/NovraLogger/blob/main/README.ja.md) | [한국어](https://github.com/Novra-tools/NovraLogger/blob/main/README.ko.md) | [Español](https://github.com/Novra-tools/NovraLogger/blob/main/README.es.md)

**desklog** 是专为 **Electron**、**Tauri** 跨端桌面应用以及 **Node.js** 服务端/CLI 打造的通用日志收集与管理库。它开箱即用提供了完整的日志生命周期管理能力：高性能级联滚动轮转、超出上限自动清理过期日志、严格磁盘空间上限控制、敏感数据递归脱敏、多用户隔离存储、一键彻底清空本地日志以及纯 JS ZIP 诊断日志打包。

---

## 核心特性

- **专为 Electron、Tauri 与 Node.js 设计**：内部不硬编码依赖 `electron` 或 `@tauri-apps/api`，完全基于标准 Node.js 与纯 JavaScript 实现，零原生 C++ 编译（无 node-gyp 困扰）。
- **高性能级联文件滚动与自动清理机制**：
  - 支持按大小限制（如 10MB）自动级联滚动重命名（`app.log` &rarr; `app.1.log` &rarr; `app.2.log`）。
  - **自动淘汰清理**：当历史日志文件数量超出 `maxFiles` 上限时，最旧的文件将被立即自动物理删除，从根本上防止日志无限膨胀占用磁盘。
  - **严格磁盘上限**：总占用严格限制在 `maxFileSize * maxFiles` 范围之内。
  - **写入节流检测**：内置写入计数器节流检测（`checkInterval`），避免频繁读取文件状态消耗 I/O。
- **一键清理本地日志**：
  - `logger.clearLogs()` / `logger.cleanLogs()`：支持按用户 ID 清理隔离日志、按天数清理过期日志。
  - `logger.clearAllLogs()`：**一键彻底清空本地所有日志**（包含全局 app 日志、所有用户专属日志目录以及 diagnostics 压缩包）。
  - 具备 Crashpad 崩溃转储（`.dmp`）保留管理，并内置 Windows 句柄锁重试机制。
- **敏感数据递归脱敏**：开箱即用支持 Token、密码、Bearer 鉴权头、手机号、邮箱及 URL Query 参数脱敏，并天然免疫对象循环引用异常。
- **一键诊断 ZIP 压缩打包**：内置纯 JS 压缩引擎，单行代码将本地日志与系统诊断元数据打包为 `.zip`，专供用户反馈与故障上传。
- **多租户 / 用户目录隔离**：自动隔离应用全局日志（`logs/app/`）与不同用户的专属日志（`logs/users/<userId>/`）。
- **极简跨端适配器**：提供零耦合的 Electron（主进程与渲染进程）及 Tauri 接入模式。
- **双格式与完整 TypeScript 支持**：同时提供 ESM 和 CommonJS 产物，附带严格的 `.d.ts` 类型声明。

---

## 安装

```bash
npm install desklog
# 或
pnpm add desklog
# 或
yarn add desklog
```

---

## 快速接入

### 1. 通用 Node.js / CLI / 后端服务

```typescript
import { createLogger } from 'desklog';

// 1. 初始化 Logger 实例
const logger = createLogger({
  appName: 'my-backend',
  logDir: './logs',              // 默认自动计算系统推荐目录或 ./logs
  level: 'debug',                // 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 3,                   // 保留当前文件 + 2 份历史轮转（严格限制总磁盘占用 <= 30MB）
  checkInterval: 50,             // 每 50 次写入检测一次大小，保障高吞吐
});

// 2. 普通记录
logger.info('服务已在 3000 端口启动');

// 3. 作用域子 Logger 与自动数据脱敏
const authLog = logger.scope('AuthModule', 'login');
authLog.info('用户登录成功', {
  userId: 'user_1001',
  token: 'eyJhbGciOiJIUzI1NiIsIn...', // 自动替换为 "[token]"
});
```

---

### 2. Electron 应用接入

#### 主进程 (`main.ts`)

```typescript
import { app, ipcMain } from 'electron';
import { createLogger, registerElectronIpc } from 'desklog';

// 初始化主日志器
const logger = createLogger({
  appName: 'my-electron-app',
  logDir: `${app.getPath('userData')}/logs`,
});

// 一键注册 IPC 通道 ('desklog:log-write', 'desklog:log-pack', 'desklog:log-clean', 'desklog:log-clear-all')
registerElectronIpc(logger, ipcMain);
```

#### Preload 脚本 (`preload.ts`)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desklog', {
  write: (payload: unknown) => ipcRenderer.invoke('desklog:log-write', payload),
  pack: (options?: unknown) => ipcRenderer.invoke('desklog:log-pack', options),
  clean: (options?: unknown) => ipcRenderer.invoke('desklog:log-clean', options),
  clearAll: () => ipcRenderer.invoke('desklog:log-clear-all'),
});
```

#### 渲染进程 (`renderer.ts` / React / Vue)

```typescript
import { createRendererLogger } from 'desklog/renderer';

const rendererLogger = createRendererLogger({
  send: (payload) => (window as any).desklog.write(payload),
  getUserId: () => getCurrentUserId(), // 可选：多用户自动分流隔离
});

// 模块级 UI 日志记录
const chatLogger = rendererLogger.scope('ChatUI', 'sendMessage');
chatLogger.info('正在向会话发送消息', { convId: 'conv_889' });
```

---

### 3. 日志滚动与磁盘占用控制

`desklog` 内置了严密的级联滚动与自动淘汰清理机制：

1. 当活动文件 `app.log` 超过 `maxFileSize`（如 10MB）时，系统自动执行级联重命名：`app.1.log` &rarr; `app.2.log`，`app.log` &rarr; `app.1.log`。
2. 超过 `maxFiles` 限制的最旧日志（如 `app.3.log`）会被**立即物理删除**，彻底杜绝日志文件无限堆积。
3. 借助 `checkInterval` 计数节流，绝大多数写操作无需执行 `fs.stat`，兼顾了极高的磁盘写入性能。

---

### 4. 一键清理本地日志

无论是用户主动在设置面板“清除缓存/日志”，还是定时清理历史文件，都可以一键调用：

```typescript
import { createLogger } from 'desklog';

const logger = createLogger();

// 1. 一键彻底清空本地所有日志、所有用户隔离子目录及临时诊断包
const wipeResult = await logger.clearAllLogs();
console.log(`成功清理 ${wipeResult.deletedCount} 个本地文件`);

// 2. 清理当前登录用户的专属日志
await logger.clearLogs({ userId: 'user_1001' });

// 3. 清理 7 天前的旧日志，并仅保留最新的 2 份崩溃 dump
await logger.cleanLogs({
  maxAgeDays: 7,
  retainCrashDumps: 2,
  crashDumpsDir: app.getPath('crashDumps'),
});
```

---

### 5. 本地日志打包压缩（用于用户反馈与诊断上传）

当用户在界面提交反馈或报错时，可一键将本地日志与系统信息打包为 `.zip`：

```typescript
import { createLogger } from 'desklog';

const logger = createLogger();

// 压缩打包本地日志
const { zipPath, size, fileCount } = await logger.packLogs({
  userId: 'current_user_id', // 可选：只打包该用户的专属日志
  metadata: {
    appVersion: '1.2.0',
    os: process.platform,
    description: '收到用户反馈：视频通话无画面',
  },
});

console.log(`压缩包已生成: ${zipPath} (${size} 字节, 包含 ${fileCount} 个文件)`);
// -> 直接将 zipPath 上传至您的 S3 / OSS 云存储
```

---

## 配置参数表

`createLogger(options)` 支持以下配置项：

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `appName` | `string` | `'desklog-app'` | 应用程序标识，用于默认目录名称与主日志文件名。 |
| `logDir` | `string` | *自动推断* | 日志存放根目录。默认推断操作系统标准目录或 `./logs`。 |
| `level` | `LogLevel` | `'info'` (生产) / `'debug'` (开发) | 最低记录日志级别（`'debug'`, `'info'`, `'warn'`, `'error'`, `'fatal'`）。 |
| `maxFileSize` | `number` | `10485760` (10MB) | 触发级联轮转的单个日志文件大小上限（字节）。 |
| `maxFiles` | `number` | `3` | 同一类日志保留的最大文件总数（包含当前活动文件与历史轮转文件，多余自动清理）。 |
| `checkInterval` | `number` | `50` | 检查文件大小的写入操作节流间隔，减少系统 I/O 开销。 |
| `maskSensitive` | `boolean` | `true` | 是否自动开启敏感信息脱敏（密码、Token、手机号等）。 |
| `sensitiveKeys` | `string[]` | `[]` | 额外自定义添加的敏感字段键名列表。 |
| `enableConsole` | `boolean` | `true` (开发) / `false` (生产) | 是否在标准控制台同步输出日志。 |
| `formatter` | `Function` | *内置格式化器* | 自定义日志行格式化函数。 |

---

## 支持与社区

- **官方网站 & X (Twitter)**: [https://x.com/novratools](https://x.com/novratools)
- **GitHub 仓库**: [https://github.com/Novra-tools/NovraLogger](https://github.com/Novra-tools/NovraLogger)
- **GitHub Issues**: [提交 Issue](https://github.com/Novra-tools/NovraLogger/issues)

---

## 开源协议

[MIT](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE) © 2026 Novra Tools
