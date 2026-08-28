# Publishing Guide / 发布说明文档

> This document provides standardized publishing instructions for developers, CI pipelines, and AI coding agents.
> 本文档为开发者、自动化 CI 流程以及 AI 编程助手提供标准化的发布与验证指引。

---

## 1. Package Identity & Metadata / 包体身份与元数据

- **Package Name (包名)**: `novra-logger`
- **Official Registry (官方注册表)**: `https://registry.npmjs.org/`
- **Access Level (访问级别)**: `public`
- **Repository (仓库地址)**: `https://github.com/Novra-tools/NovraLogger.git`
- **Official Website & Socials**: `https://x.com/novratools`

---

## 2. Pre-requisites & Authentication / 前置准备与身份认证

When publishing to the npm registry, always specify the official npm registry explicitly:
发布到官方 npm 注册表时，务必显式指定官方源地址：

```bash
# 1. 登录 npm 账号 (Login to npm)
npm login --registry=https://registry.npmjs.org/

# 2. 验证当前登录用户身份 (Verify current authenticated user)
npm whoami --registry=https://registry.npmjs.org/
```

> **Note / 注意**：如果使用了淘宝镜像（npmmirror）或其他私有镜像源，必须显式带上 `--registry=https://registry.npmjs.org/`，避免向镜像代理源错误提交。

---

## 3. One-Click Release Workflow / 一键发布全流程

### Option A: Monorepo Root Release (Recommended / 推荐)

在项目根目录下执行标准一键发布流程：

```bash
# 1. 执行安全审计与发布全流程模拟（不产生实际发布）
pnpm release:dry

# 2. 执行正式一键发布（自动运行类型检查 -> 跑完全量测试 -> 构建产物 -> 白名单安全审计 -> 发布）
pnpm release
```

### Option B: Direct Package Directory Release / 子包目录独立发布

如需直接进入 `packages/logger` 目录手动发布：

```bash
cd packages/logger

# 1. 运行类型检查、单元测试与构建
pnpm run prepublishOnly

# 2. 检查待入包文件白名单（确保 0 源码与敏感文件泄露）
npm pack --dry-run

# 3. 发布至公共仓库
npm publish --access public --registry=https://registry.npmjs.org/
```

---

## 4. Release Security & File Leak Prevention / 发布安全与防泄露机制

为防止敏感代码、未编译 TS 源码、测试用例或调试日志意外打包泄露，本仓库配置了四重防御：

1. **`package.json` 的 `files` 白名单**：
   - 仅包含 `dist/`、`CHANGELOG.md`、`LICENSE`、`README*.md`、`PUBLISHING.md`。
2. **`packages/logger/.npmignore` 黑名单**：
   - 强制拦截 `src/`、`test/`、`examples/`、`*.log`、`*.zip`、`*.dmp`、`.tmp*`、`.env*`。
3. **自动化安全审计 (`scripts/verify-release.mjs`)**：
   - 在发布前通过正则扫描全部入包文件，一旦发现 `src/` 或敏感配置文件立即终止发布。
4. **CI/CD 自动化校验 (`.github/workflows/ci.yml`)**。

---

## 5. Automated CI/CD Publish via GitHub Actions / GitHub Actions 自动发布

1. 在 GitHub 仓库 **Settings -> Secrets and variables -> Actions** 中添加变量：`NPM_TOKEN`（npm 访问令牌）。
2. 在 GitHub 仓库创建一个 Release（如 `v1.0.0`），GitHub Actions 将自动触发 `.github/workflows/publish.yml` 完成全流程安全审计并发布到 npm。

---

## 6. AI Agent Guidelines / 给其他 AI 助手的操作指引

当其他 AI 助手接手维护或执行发布任务时，请遵循以下固定流程：

1. **代码检查**：运行 `pnpm -r typecheck` 和 `pnpm test`，确保 100% 通过。
2. **构建验证**：运行 `pnpm build`。
3. **安全审计**：运行 `node scripts/verify-release.mjs`，确保没有源码泄露。
4. **用户登录检查**：执行 `npm whoami --registry=https://registry.npmjs.org/`。
   - 若返回 `ENEEDAUTH`，提示用户在终端执行 `npm login --registry=https://registry.npmjs.org/`。
5. **发布指令**：在根目录下执行 `pnpm release`。
