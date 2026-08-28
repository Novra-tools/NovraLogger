import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const PKG_DIR = join(ROOT_DIR, 'packages', 'logger');
const rawPkg = readFileSync(join(PKG_DIR, 'package.json'), 'utf8').replace(/^\uFEFF/, '');
const pkgJson = JSON.parse(rawPkg);

const isDryRun = process.argv.includes('--dry-run');

console.log(`\n🚀 Starting one-click release pipeline for ${pkgJson.name} (v${pkgJson.version})...\n`);

// 1. 运行安全审计与构建校验
try {
  execSync('node scripts/verify-release.mjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (err) {
  console.error('\n❌ Pre-release verification failed. Aborting release.');
  process.exit(1);
}

// 2. 执行 npm 发布
if (isDryRun) {
  console.log(`\n🧪 [DRY RUN MODE] Simulating npm publish for ${pkgJson.name}@${pkgJson.version}...`);
  execSync('npm publish --access public --dry-run', { stdio: 'inherit', cwd: PKG_DIR });
  console.log('\n✨ Dry run completed successfully! Everything is clean and ready.');
} else {
  console.log(`\n📦 Publishing ${pkgJson.name}@${pkgJson.version} to npm registry...`);
  try {
    execSync('npm publish --access public', { stdio: 'inherit', cwd: PKG_DIR });
    console.log(`\n🎉 SUCCESS! ${pkgJson.name}@${pkgJson.version} published successfully!`);
    console.log(`🔗 NPM Link: https://www.npmjs.com/package/${pkgJson.name}\n`);
  } catch (err) {
    console.error('\n❌ npm publish failed. Please ensure you are logged into npm (npm login) and have write permissions.');
    process.exit(1);
  }
}
