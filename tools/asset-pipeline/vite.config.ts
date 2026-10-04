import { defineConfig } from 'vite';

// Serves dev/lineup.html, which draws every processed model next to a 1.8 m figure.
export default defineConfig({
  root: 'dev',
  publicDir: '../../../apps/web/public',
  server: { port: 5176, strictPort: true },
  preview: { port: 5176, strictPort: true },
});
