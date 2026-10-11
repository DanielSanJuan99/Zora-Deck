import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const copyConfigPlugin = () => {
  return {
    name: 'copy-config',
    writeBundle() {
      const srcDir = join(process.cwd(), 'src', 'config');
      const destDir = join(process.cwd(), '.vite', 'build', 'config');

      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      copyFileSync(join(srcDir, 'obs-events.json'), join(destDir, 'obs-events.json'));
      copyFileSync(join(srcDir, 'twitch-events.json'), join(destDir, 'twitch-events.json'));
    }
  }
}

export default defineConfig({
  plugins: [copyConfigPlugin()],
  build: {
    rollupOptions: {
      external: [
        'bufferutil',
        'utf-8-validate',
        'node:fs/promises'
      ],
    },
  },
});