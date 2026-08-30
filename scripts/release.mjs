import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const PKG_DIR = join(ROOT_DIR, 'packages', 'logger');
const rawPkg = readFileSync(join(PKG_DIR, 'package.json'), 'utf8').replace(/^\uFEFF/, '');
const pkgJson = JSON.parse(rawPkg);

const isDryRun = process.argv.includes('--dry-run');

// Parse incoming --otp argument
const otpArg = process.argv.find(arg => arg.startsWith('--otp=') || arg === '--otp');
let otpFlag = '';
if (otpArg) {
  if (otpArg.startsWith('--otp=')) {
    otpFlag = ` ${otpArg}`;
  } else {
    const idx = process.argv.indexOf('--otp');
    if (idx !== -1 && process.argv[idx + 1]) {
      otpFlag = ` --otp=${process.argv[idx + 1]}`;
    }
  }
}

console.log(`\n🚀 Starting one-click release pipeline for ${pkgJson.name} (v${pkgJson.version})...\n`);

// 1. Run security audit and build verification
try {
  execSync('node scripts/verify-release.mjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (err) {
  console.error('\n❌ Pre-release verification failed. Aborting release.');
  process.exit(1);
}

// 2. Execute npm publish
if (isDryRun) {
  console.log(`\n🧪 [DRY RUN MODE] Simulating npm publish for ${pkgJson.name}@${pkgJson.version}...`);
  execSync('npm publish --access public --registry=https://registry.npmjs.org/ --dry-run', { stdio: 'inherit', cwd: PKG_DIR });
  console.log('\n✨ Dry run completed successfully! Everything is clean and ready.');
} else {
  console.log(`\n📦 Publishing ${pkgJson.name}@${pkgJson.version} to npm registry...`);
  try {
    const publishCmd = `npm publish --access public --registry=https://registry.npmjs.org/${otpFlag}`;
    execSync(publishCmd, { stdio: 'inherit', cwd: PKG_DIR });
    console.log(`\n🎉 SUCCESS! ${pkgJson.name}@${pkgJson.version} published successfully!`);
    console.log(`🔗 NPM Link: https://www.npmjs.com/package/${pkgJson.name}\n`);
  } catch (err) {
    console.error('\n❌ npm publish failed.');
    if (err.message && err.message.includes('EOTP')) {
      console.error('💡 Hint: Two-Factor Authentication (2FA) is enabled on your npm account. Run with OTP: pnpm release --otp=<6-digit-otp>');
    }
    process.exit(1);
  }
}
