import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer, defaultClientConditions, type ViteDevServer } from 'vite';

import type { DesignDocument } from '@parkshape/core';
import type {
  SeedSite,
  ThumbnailJob,
  ThumbnailMode,
  ThumbnailPicture,
  ThumbnailReport,
  ThumbnailStep,
} from '@parkshape/db/seed';
import {
  PLAN_POSTER_HEIGHT,
  PLAN_POSTER_WIDTH,
  planPosterSvg,
  readPalette,
} from '@parkshape/scene/plan';

import { renderSceneOrPoster } from './scene-retry.js';
import { frameFor, heightmapPayload } from './thumbnail-page/payload.js';

const PAGE_ROOT = fileURLToPath(new URL('./thumbnail-page/', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../../../apps/web/public/', import.meta.url));
const SOURCE_CONDITION = '@parkshape/source';
// Software WebGL, as in the web app's Playwright config, so a machine with no GPU still draws.
const SWIFTSHADER = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const PAGE_READY_MS = 120_000;
const WEBP_QUALITY = 0.8;
// Outside a browser there are no CSS custom properties, so the palette is the scene fallback.
const POSTER_PALETTE = readPalette(() => '');

export type SaveImage = (job: ThumbnailJob, image: Uint8Array) => Promise<void>;

export interface ThumbnailLog {
  info(message: string): void;
}

async function startPageServer(): Promise<ViteDevServer> {
  const server = await createServer({
    root: PAGE_ROOT,
    publicDir: PUBLIC_DIR,
    configFile: false,
    logLevel: 'error',
    plugins: [react()],
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    // No file watching: an edit in the workspace must not reload the page mid-seed.
    server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  return server;
}

async function renderScene(page: Page, site: SeedSite, job: SceneJob) {
  const base64 = await page.evaluate(
    async ({ doc, parcel, terrain, frame }) => {
      const render = window.seedThumbnail;
      if (render === undefined) throw new Error('thumbnail page did not load');
      return render(doc, parcel, terrain, frame);
    },
    {
      doc: job.document,
      parcel: site.parcel,
      terrain: heightmapPayload(site.heightmap),
      frame: frameFor(job.picture),
    },
  );
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function renderPoster(page: Page, site: SeedSite, document: DesignDocument) {
  const svg = planPosterSvg({ document, parcel: site.parcel, palette: POSTER_PALETTE });
  await page.setViewportSize({ width: PLAN_POSTER_WIDTH, height: PLAN_POSTER_HEIGHT });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  return toWebp(page, await page.screenshot({ type: 'png' }));
}

/** Re-encodes a screenshot as WebP in the page; keeps the PNG where WebP is not supported. */
async function toWebp(page: Page, png: Buffer): Promise<Uint8Array> {
  const base64 = await page.evaluate(
    async ({ data, quality }) => {
      const source = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(source);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
      if (webp.type !== 'image/webp') return data;
      const bytes = new Uint8Array(await webp.arrayBuffer());
      return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    },
    { data: png.toString('base64'), quality: WEBP_QUALITY },
  );
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function scenePage(browser: Browser, server: ViteDevServer): Promise<Page | undefined> {
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) return undefined;
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.seedThumbnail !== undefined, null, {
    timeout: PAGE_READY_MS,
  });
  return page;
}

interface SceneJob {
  readonly document: DesignDocument;
  readonly picture: ThumbnailPicture;
}

interface Renderer {
  readonly mode: ThumbnailMode;
  render(job: SceneJob): Promise<Uint8Array>;
}

/** Draws posters on their own page, opened on first use, so the scene page stays loaded. */
function posterRenderer(browser: Browser, site: SeedSite) {
  let page: Promise<Page> | undefined;
  return async (job: SceneJob) => {
    page ??= browser.newPage();
    return renderPoster(await page, site, job.document);
  };
}

async function pickRenderer(browser: Browser, site: SeedSite, sample: SceneJob, log: ThumbnailLog) {
  let server: ViteDevServer | undefined;
  const poster = posterRenderer(browser, site);
  try {
    server = await startPageServer();
    const page = await scenePage(browser, server);
    if (page !== undefined) {
      await renderScene(page, site, sample);
      const scene = (job: SceneJob) => renderScene(page, site, job);
      const renderer: Renderer = {
        mode: 'scene',
        render: (job) => renderSceneOrPoster(job, { scene, poster }, log),
      };
      return { renderer, server };
    }
  } catch (error) {
    log.info(`3D thumbnails unavailable, using the plan poster: ${String(error)}`);
  }
  await server?.close();
  const renderer: Renderer = { mode: 'poster', render: poster };
  return { renderer, server: undefined };
}

async function launch(log: ThumbnailLog): Promise<Browser | undefined> {
  try {
    return await chromium.launch({ args: SWIFTSHADER });
  } catch (error) {
    log.info(`Chromium is not available, so no thumbnails are stored: ${String(error)}`);
    return undefined;
  }
}

/**
 * Draws each design with the scene thumbnail renderer in headless Chromium. When WebGL does not
 * start, it draws the SVG plan poster instead; without Chromium it stores nothing, and the web
 * app shows the same poster in the browser.
 */
export function browserThumbnails(save: SaveImage, log: ThumbnailLog): ThumbnailStep {
  return {
    async render(site, jobs): Promise<ThumbnailReport> {
      const [first] = jobs;
      const browser = first === undefined ? undefined : await launch(log);
      if (browser === undefined || first === undefined) return { mode: 'skipped', rendered: 0 };
      const sample = { document: first.design.document, picture: first.picture };
      const { renderer, server } = await pickRenderer(browser, site, sample, log);
      try {
        for (const job of jobs) {
          await save(
            job,
            await renderer.render({ document: job.design.document, picture: job.picture }),
          );
        }
        return { mode: renderer.mode, rendered: jobs.length };
      } finally {
        await browser.close();
        await server?.close();
      }
    },
  };
}
