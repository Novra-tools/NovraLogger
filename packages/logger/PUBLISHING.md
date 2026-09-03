# Publishing Guide

> This document provides standardized publishing instructions for developers, CI pipelines, and AI coding agents.

---

## 1. Package Identity & Metadata

- **Package Name**: `desklog`
- **Official Registry**: `https://registry.npmjs.org/`
- **Access Level**: `public`
- **Repository**: `https://github.com/Novra-tools/NovraLogger.git`
- **Official Website & Socials**: `https://x.com/novratools`

---

## 2. Prerequisites & Authentication

When publishing to the npm registry, always specify the official npm registry explicitly:

```bash
# 1. Login to npm account
npm login --registry=https://registry.npmjs.org/

# 2. Verify authenticated user identity
npm whoami --registry=https://registry.npmjs.org/
```

> **Note**: If using a custom mirror or proxy (e.g. npmmirror), always include `--registry=https://registry.npmjs.org/` to avoid publishing errors.

---

## 3. One-Click Release Workflow

### Option A: Monorepo Root Release (Recommended)

Run the standard release pipeline from the monorepo root:

```bash
# 1. Simulate the entire release and security audit pipeline (Dry run mode)
pnpm release:dry

# 2. Execute one-click release (Build -> Typecheck -> Test -> Security Audit -> Publish)
pnpm release
```

### Option B: Direct Package Directory Release

To publish manually from the package directory:

```bash
cd packages/logger

# 1. Run typecheck, unit tests, and build
pnpm run prepublishOnly

# 2. Inspect the tarball to ensure zero sensitive file leaks
npm pack --dry-run

# 3. Publish to public npm registry
npm publish --access public --registry=https://registry.npmjs.org/
```

---

## 4. Release Security & File Leak Prevention

To prevent uncompiled TypeScript source code, test suites, or sensitive configuration files from leaking into the published package, this repository enforces a four-layer defense:

1. **`package.json` `files` whitelist**:
   - Only includes `dist/`, `CHANGELOG.md`, `LICENSE`, `README*.md`, and `PUBLISHING.md`.
2. **`packages/logger/.npmignore` blacklist**:
   - Explicitly blocks `src/`, `test/`, `examples/`, `*.log`, `*.zip`, `*.dmp`, `.tmp*`, and `.env*`.
3. **Automated Security Audit (`scripts/verify-release.mjs`)**:
   - Scans all packaged files against forbidden regular expressions before publishing.
4. **CI/CD Automated Verification (`.github/workflows/ci.yml`)**.

---

## 5. Automated CI/CD Publish via GitHub Actions

1. In GitHub Repository **Settings -> Secrets and variables -> Actions**, configure secret: `NPM_TOKEN` (npm access token).
2. Create a GitHub Release (e.g. `v1.0.0`), and GitHub Actions will automatically trigger `.github/workflows/publish.yml` to run security audits and publish to npm.

---

## 6. AI Agent Guidelines

When other AI coding assistants take over maintenance or execute publishing tasks, adhere to this workflow:

1. **Code Verification**: Run `pnpm run build && pnpm run typecheck && pnpm test`, ensuring 100% pass.
2. **Security Audit**: Run `node scripts/verify-release.mjs` to ensure zero source code or sensitive leaks.
3. **User Authentication**: Run `npm whoami --registry=https://registry.npmjs.org/`.
   - If it returns `ENEEDAUTH`, instruct the user to run `npm login --registry=https://registry.npmjs.org/`.
4. **Publish**: Run `pnpm release` from the repository root.

