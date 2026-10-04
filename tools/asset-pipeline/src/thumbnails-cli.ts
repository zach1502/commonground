import { fileURLToPath } from 'node:url';

import { chromium, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer, defaultClientConditions, type ViteDevServer } from 'vite';

import { catalogItems } from '@parkshape/core';

import { parseThumbnailArgs, runThumbnails, type ThumbnailRenderer } from './thumbnails-run.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../../../apps/web/public/', import.meta.url));
// Software WebGL, as in the web app's Playwright config, so every machine draws the same pixels.
const SWIFTSHADER = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const PAGE_READY_MS = 120_000;
// argv holds the node binary and the script path before the flags.
const FIRST_FLAG_INDEX = 2;

/** What thumbs/main.ts puts on the page's window. The evaluated functions run in the page. */
interface PageGlobals {
  readonly catalogThumbnailSettings?: unknown;
  readonly catalogThumbnail?: (modelKey: string, url: string) => Promise<string>;
}

async function startPageServer(): Promise<ViteDevServer> {
  const server = await createServer({
    root: `${PACKAGE_DIR}thumbs`,
    publicDir: PUBLIC_DIR,
    configFile: false,
    logLevel: 'error',
    plugins: [react()],
    resolve: { conditions: ['@parkshape/source', ...defaultClientConditions] },
    server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  return server;
}

/** Opens the thumbnail page and wraps its two window functions as a renderer. */
async function pageRenderer(page: Page, server: ViteDevServer): Promise<ThumbnailRenderer> {
  page.on('pageerror', (error) => {
    process.stderr.write(`thumbnail page: ${error.message}\n`);
  });
  await page.goto(server.resolvedUrls?.local[0] ?? 'about:blank');
  await page.waitForFunction(
    () => (globalThis as unknown as PageGlobals).catalogThumbnail !== undefined,
    null,
    { timeout: PAGE_READY_MS },
  );
  return {
    settings: () =>
      page.evaluate(() => (globalThis as unknown as PageGlobals).catalogThumbnailSettings),
    render: async (modelKey, url) => {
      const base64 = await page.evaluate(
        async (args) => {
          const render = (globalThis as unknown as PageGlobals).catalogThumbnail;
          if (render === undefined) throw new Error('thumbnail page did not load');
          return render(args.modelKey, args.url);
        },
        { modelKey, url },
      );
      return Buffer.from(base64, 'base64');
    },
  };
}

async function main(): Promise<void> {
  const options = parseThumbnailArgs(process.argv.slice(FIRST_FLAG_INDEX));
  const server = await startPageServer();
  const browser = await chromium.launch({ args: SWIFTSHADER });
  try {
    const renderer = await pageRenderer(await browser.newPage(), server);
    await runThumbnails(
      {
        publicDir: PUBLIC_DIR,
        manifest: `${PACKAGE_DIR}generated/thumbnails.manifest.json`,
        modelsManifest: `${PACKAGE_DIR}generated/models.manifest.json`,
      },
      options,
      {
        items: catalogItems.map(({ id, modelKey }) => ({ id, modelKey })),
        renderer,
        log: (line) => process.stdout.write(`${line}\n`),
      },
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
