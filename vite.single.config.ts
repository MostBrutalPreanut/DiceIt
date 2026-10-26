import { defineConfig } from 'vite';

/** Which build a player is on (sent with their feedback): the commit on CI, the date otherwise. */
const build = process.env.GITHUB_SHA?.slice(0, 7) ?? `local ${new Date().toISOString().slice(0, 10)}`;
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file (JS and CSS inlined). Used for the hosted artifact build.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: 'dist-single', chunkSizeWarningLimit: 4000 },
});
