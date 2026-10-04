import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig, type Plugin } from 'vite';

import { SOURCE_CONDITION } from '../../vitest.shared.config.ts';

import { bootShellMarkup, injectBootShell } from './src/build/boot-shell.ts';
import { buildTarget } from './src/build/build-target.ts';
import { vendorChunk } from './src/build/vendor-chunks.ts';
import { injectVotePreload, votePreloadPlan } from './src/build/vote-preload.ts';
import en from './src/locales/en.json' with { type: 'json' };

const DEV_SERVER_PORT = 5173;
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Writes the vote page's chunk list into the inline script in index.html, so a visit to the vote
 * URL loads the route's modules beside the entry instead of after it. Dev has no chunks.
 */
function votePreload(): Plugin {
  let base = '/';
  return {
    name: 'parkshape-vote-preload',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) =>
        injectVotePreload(
          html,
          ctx.bundle === undefined ? null : votePreloadPlan(ctx.bundle, base),
        ),
    },
  };
}

/**
 * Draws the page skeleton in index.html itself, so a slow link shows it as soon as the styles
 * arrive instead of a blank page until the entry script has run.
 */
function bootShell(): Plugin {
  return {
    name: 'parkshape-boot-shell',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injectBootShell(html, bootShellMarkup(en.app.loading)),
    },
  };
}

// Bundle workspace packages from src, so the app and its e2e build never use a stale dist.
export default defineConfig({
  plugins: [react(), votePreload(), bootShell()],
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  server: { port: DEV_SERVER_PORT },
  build: {
    target: buildTarget(REPO_ROOT),
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
});
