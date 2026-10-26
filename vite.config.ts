import { defineConfig } from 'vite';

/** Which build a player is on (sent with their feedback): the commit on CI, the date otherwise. */
const build = process.env.GITHUB_SHA?.slice(0, 7) ?? `local ${new Date().toISOString().slice(0, 10)}`;

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // the game, and the prop lab (a dev page: every part in every theme and state)
    rollupOptions: { input: { main: 'index.html', lab: 'lab.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120_000 },
} as any);
