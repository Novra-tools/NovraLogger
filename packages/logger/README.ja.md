# desklog — Electron、Tauri、Node.js 向けのユニバーサルなログ収集・管理ライブラリ

[![npm version](https://img.shields.io/npm/v/desklog?style=flat-square)](https://www.npmjs.com/package/desklog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE)
[![X (Twitter)](https://img.shields.io/badge/X-@novratools-blue?style=flat-square&logo=x)](https://x.com/novratools)

[English](https://github.com/Novra-tools/NovraLogger/blob/main/README.md) | [简体中文](https://github.com/Novra-tools/NovraLogger/blob/main/README.zh-CN.md) | [日本語](https://github.com/Novra-tools/NovraLogger/blob/main/README.ja.md) | [한국어](https://github.com/Novra-tools/NovraLogger/blob/main/README.ko.md) | [Español](https://github.com/Novra-tools/NovraLogger/blob/main/README.es.md)

**desklog** は、**Electron**、**Tauri**、および **Node.js** アプリケーション向けに設計されたユニバーサルなログ収集・管理ライブラリです。カスケードローテーション、上限超過時の自動期限切れログ削除、ディスク使用量の上限制御、機密データの自動マスキング、マルチユーザー分離、ワンクリック全ログ削除、純粋な JS によるワンコール ZIP ログパッケージング機能を提供します。

---

## 主な機能

- **Electron、Tauri、Node.js 対応**：`electron` や `@tauri-apps/api` にハードコードされた依存関係がなく、ネイティブ C++ コンパイル（node-gyp なし）を必要としません。
- **高効率なカスケードローテーションと自動パージ**：
  - 設定されたファイルサイズに基づいてログを自動ローテーション（`app.log` &rarr; `app.1.log` &rarr; `app.2.log`）。
  - `maxFiles` の上限を超えた最も古いアーカイブファイルは**直ちに自動削除**され、ディスクの圧迫を防止します。
  - ディスク使用量を `maxFileSize * maxFiles` 内に厳密に制限。
  - 書き込み回数によるスロットル判定（`checkInterval`）でファイルシステムの I/O 負荷を最小化。
- **ワンクリックでのローカルログ削除**：
  - `logger.clearLogs()` / `logger.cleanLogs()`：ユーザー別または保持日数に応じたログクリーンアップ。
  - `logger.clearAllLogs()`：アプリログ、全ユーザーログ、診断アーカイブを含む**ローカルログの完全一括削除**。
- **機密情報の自動マスキング**：トークン、パスワード、Bearer ヘッダー、電話番号、URL クエリを自動的にマスク。循環参照にも安全に対応。
- **ワンクリック ZIP 圧縮出力**：ユーザーからのフィードバックや障害診断用のログ一式を単一の `.zip` アーカイブに即座に圧縮。
- **マルチユーザー分離**：アプリ全体のログ（`logs/app/`）とユーザー固有のログ（`logs/users/<userId>/`）を自動的に分離。
- **TypeScript & ESM/CJS 完全対応**：完全な型定義を同梱しています。

---

## インストール

```bash
npm install desklog
# または
pnpm add desklog
```

---

## クイックスタート

```typescript
import { createLogger } from 'desklog';

const logger = createLogger({
  appName: 'my-app',
  logDir: './logs',
  level: 'debug',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 3,                   // 最大 3 世代保持（最大 30MB に制限）
  checkInterval: 50,
});

logger.info('アプリケーションが起動しました');

// スコープ付きロガーと自動マスキング
const chatLog = logger.scope('ChatModule', 'send');
chatLog.info('メッセージを送信しました', {
  userId: 'user_100',
  token: 'secret_jwt_token', // 自動的に "[token]" にマスク
});

// ワンクリック全ログクリーンアップ
await logger.clearAllLogs();

// 診断用 ZIP パッケージの作成
const { zipPath, fileCount } = await logger.packLogs({
  metadata: { version: '1.0.0' },
});
console.log(`ZIP 出力完了: ${zipPath}`);
```

---

## サポートとコミュニティ

- **公式ウェブサイト & X (Twitter)**: [https://x.com/novratools](https://x.com/novratools)
- **GitHub リポジトリ**: [https://github.com/Novra-tools/NovraLogger](https://github.com/Novra-tools/NovraLogger)
- **GitHub Issues**: [Issues Tracker](https://github.com/Novra-tools/NovraLogger/issues)

---

## ライセンス

[MIT](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE) © 2026 Novra Tools

