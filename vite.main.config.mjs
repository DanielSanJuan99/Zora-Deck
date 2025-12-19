import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: [
                '@twurple/auth',
                '@twurple/api',
                '@twurple/chat',
                '@twurple/eventsub-ws',
                'node:fs/promises'
            ],
        },
    },
});
