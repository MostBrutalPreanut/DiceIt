import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // the game, and the prop lab (a dev page: every part in every theme and state)
    rollupOptions: { input: { main: 'index.html', lab: 'lab.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120_000 },
} as any);
