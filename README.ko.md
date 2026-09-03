# desklog — Electron, Tauri 및 Node.js를 위한 범용 로그 수집 및 관리 라이브러리

[![npm version](https://img.shields.io/npm/v/desklog?style=flat-square)](https://www.npmjs.com/package/desklog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE)
[![X (Twitter)](https://img.shields.io/badge/X-@novratools-blue?style=flat-square&logo=x)](https://x.com/novratools)

[English](https://github.com/Novra-tools/NovraLogger/blob/main/README.md) | [简体中文](https://github.com/Novra-tools/NovraLogger/blob/main/README.zh-CN.md) | [日本語](https://github.com/Novra-tools/NovraLogger/blob/main/README.ja.md) | [한국어](https://github.com/Novra-tools/NovraLogger/blob/main/README.ko.md) | [Español](https://github.com/Novra-tools/NovraLogger/blob/main/README.es.md)

**desklog**는 **Electron**, **Tauri** 및 **Node.js** 애플리케이션을 위해 설계된 범용 로그 수집 및 관리 라이브러리입니다. 캐스케이드 파일 롤링, 한도 초과 시 자동 만료 로그 삭제, 엄격한 디스크 공간 제한 보장, 민감 데이터 자동 마스킹, 멀티 유저 디렉터리 격리, 원클릭 로컬 로그 삭제, 순수 JS 기반의 원클릭 ZIP 압축 진단 패키징 기능을 지원합니다.

---

## 주요 기능

- **Electron, Tauri, Node.js 완벽 지원**: `electron`이나 `@tauri-apps/api`에 종속되지 않으며, 네이티브 C++ 빌드(node-gyp 불필요) 없이 순수 Node.js 환경에서 작동합니다.
- **고성능 캐스케이드 파일 로테이션 및 자동 삭제**:
  - 지정된 파일 크기(예: 10MB)에 도달하면 자동으로 롤링(`app.log` &rarr; `app.1.log` &rarr; `app.2.log`)합니다.
  - `maxFiles` 개수를 초과하는 가장 오래된 로그 파일은 **즉시 자동으로 영구 삭제**되어 디스크 용량 무한 증식을 원천 차단합니다.
  - 디스크 총 사용량이 `maxFileSize * maxFiles` 이내로 엄격히 제한됩니다.
  - 쓰기 횟수 기반 쓰로틀링 검사(`checkInterval`)를 통해 I/O 오버헤드를 최소화합니다.
- **원클릭 로컬 로그 완전 삭제**:
  - `logger.clearLogs()` / `logger.cleanLogs()`: 사용자별 또는 기간별 로그 삭제.
  - `logger.clearAllLogs()`: 모든 사용자 로그, 앱 로그 및 진단 압축 파일을 **한 번에 완전히 삭제**.
- **민감 데이터 자동 마스킹**: 토큰, 비밀번호, Bearer 인증 헤더, 전화번호, URL 쿼리 파라미터를 자동으로 마스킹합니다.
- **원클릭 ZIP 로그 압축 패키징**: 고객 지원 및 버그 리포트를 위한 로그 압축 패키지를 단 한 줄의 코드로 생성합니다.
- **멀티 테넌트/사용자별 격리**: 전역 애플리케이션 로그(`logs/app/`)와 사용자별 로그(`logs/users/<userId>/`)를 자동으로 분리합니다.
- **TypeScript 및 ESM/CJS 완벽 지원**: 완전한 타입 선언 파일(`.d.ts`)을 제공합니다.

---

## 설치

```bash
npm install desklog
# 또는
pnpm add desklog
```

---

## 빠른 시작

```typescript
import { createLogger } from 'desklog';

const logger = createLogger({
  appName: 'my-app',
  logDir: './logs',
  level: 'debug',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 3,                   // 최대 3개 유지 (총 30MB 이하로 엄격 제한)
  checkInterval: 50,
});

logger.info('애플리케이션이 시작되었습니다');

// 스코프 로거 및 자동 마스킹
const authLog = logger.scope('AuthModule', 'login');
authLog.info('사용자 로그인 성공', {
  userId: 'user_1001',
  token: 'secret_jwt_token', // 자동으로 "[token]"으로 마스킹
});

// 원클릭 전체 로그 삭제
await logger.clearAllLogs();

// 진단용 ZIP 패키징
const { zipPath, fileCount } = await logger.packLogs({
  metadata: { version: '1.0.0' },
});
console.log(`ZIP 파일 생성 완료: ${zipPath}`);
```

---

## 지원 및 커뮤니티

- **공식 웹사이트 & X (Twitter)**: [https://x.com/novratools](https://x.com/novratools)
- **GitHub 저장소**: [https://github.com/Novra-tools/NovraLogger](https://github.com/Novra-tools/NovraLogger)
- **GitHub Issues**: [이슈 등록](https://github.com/Novra-tools/NovraLogger/issues)

---

## 라이선스

[MIT](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE) © 2026 Novra Tools

