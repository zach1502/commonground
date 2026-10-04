import { definePackageConfig } from '../../vitest.shared.config.ts';

// The entry points and the browser steps run only against a real process and browser; the
// seed itself is covered through the gateway test.
export default definePackageConfig({
  coverageExclude: [
    'src/cli.ts',
    'src/serve.ts',
    'src/seed-demo.ts',
    'src/thumbnails.ts',
    'src/thumbnail-page/**',
  ],
});
