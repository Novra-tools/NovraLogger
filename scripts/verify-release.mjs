import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const PKG_DIR = join(ROOT_DIR, 'packages', 'logger');

console.log('\n📦 [1/4] Building clean distribution artifacts...');
execSync('pnpm build', { stdio: 'inherit', cwd: ROOT_DIR });

console.log('\n🔒 [2/4] Running strict monorepo typecheck...');
execSync('pnpm run typecheck', { stdio: 'inherit', cwd: ROOT_DIR });

console.log('\n🧪 [3/4] Running complete test suite...');
execSync('pnpm test', { stdio: 'inherit', cwd: ROOT_DIR });

console.log('\n🛡️ [4/4] Inspecting npm tarball for sensitive content and file leaks...');
const packRaw = execSync('npm pack --dry-run --ignore-scripts --json', { cwd: PKG_DIR }).toString().replace(/^\uFEFF/, '');
const jsonStart = packRaw.indexOf('[');
const jsonEnd = packRaw.lastIndexOf(']') + 1;
const jsonStr = jsonStart !== -1 && jsonEnd !== -1 ? packRaw.slice(jsonStart, jsonEnd) : packRaw;

const packJson = JSON.parse(jsonStr);
const tarballInfo = Array.isArray(packJson) ? packJson[0] : packJson;

const files = tarballInfo.files.map(f => f.path);
console.log(`\n📋 Tarball files to be published (${files.length} files, unpacked size: ${(tarballInfo.size / 1024).toFixed(2)} KB):`);
files.forEach(f => console.log(`   ✓ ${f}`));

// Strict security audit: forbid uncompiled source code, tests, configs, or sensitive files from leaking into the published package
const FORBIDDEN_PATTERNS = [
  /^src\//i,
  /^test\//i,
  /^examples\//i,
  /\.env/i,
  /\.tmp/i,
  /\.log$/i,
  /\.dmp$/i,
  /\.zip$/i,
  /tsconfig/i,
  /vitest/i,
  /tsup/i,
  /pnpm/i,
  /node_modules/i,
];

const leakedFiles = files.filter(file =>
  FORBIDDEN_PATTERNS.some(pattern => pattern.test(file))
);

if (leakedFiles.length > 0) {
  console.error('\n❌ SECURITY AUDIT FAILED! The following unapproved/sensitive files were found in the tarball:');
  leakedFiles.forEach(f => console.error(`   🚨 LEAKED: ${f}`));
  process.exit(1);
}

console.log('\n✅ SECURITY AUDIT PASSED! All release files verified clean with ZERO sensitive leaks.\n');
