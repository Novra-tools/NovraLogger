import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    preload: 'src/preload.ts',
    'renderer/renderer': 'src/renderer/renderer.ts',
  },
  format: ['cjs'],
  clean: true,
  external: ['electron'],
  onSuccess: async () => {
    mkdirSync('dist/renderer', { recursive: true });
    copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
    copyFileSync('src/renderer/style.css', 'dist/renderer/style.css');
  },
});
