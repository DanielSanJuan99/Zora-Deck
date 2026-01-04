import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        '@twurple/auth',
        '@twurple/api',
        '@twurple/chat',
        '@twurple/eventsub-ws',
        'obs-websocket-js',
        'bufferutil',        // Necesario para evitar el error de la imagen 1
        'utf-8-validate',    // Dependencia hermana de bufferutil
        'node:fs/promises'
      ],
    },
  },
});