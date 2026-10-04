/**
 * Renders the landing hero: the seeded Jonathan Rogers baseline on the dev page, drawn by
 * renderThumbnail with the 'hero' frame, so it uses renderPreset('offline') like the project
 * page baseline and the design thumbnails. Writes WebP and PNG at 1920x1080 and 960x540 to
 * apps/web/public/hero. Needs ImageMagick (`magick`) on the PATH, as
 * the asset pipeline's texture step does.
 *
 *   pnpm --filter @parkshape/scene render-hero
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { devPageUrl, REPO_ROOT } from './dev-page.ts';

const PORT = 5186;
const WIDE = { width: 1920, height: 1080 };
const NARROW = { width: 960, height: 540 };
const WEBP_QUALITY = '78';
// Palette PNG: the flat sky and low-poly shading survive 256 colours with dithering.
const PNG_COLOURS = '256';
const HERO_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public', 'hero');
const HARDWARE_GL =
  process.platform === 'darwin'
    ? ['--use-angle=metal', '--ignore-gpu-blocklist']
    : ['--ignore-gpu-blocklist'];

async function capture(baseUrl: string, file: string): Promise<void> {
  const browser = await chromium.launch({ args: HARDWARE_GL });
  try {
    const page = await browser.newPage({ viewport: WIDE, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}${devPageUrl({ park: 'baseline', tier: 'desktop' })}`);
    await page.waitForFunction(() => typeof window.__parkshapeRenderOffline === 'function');
    const base64 = await page.evaluate(() => window.__parkshapeRenderOffline('hero'));
    writeFileSync(file, Buffer.from(base64, 'base64'));
  } finally {
    await browser.close();
  }
}

function encode(source: string, size: { width: number; height: number }, name: string): string[] {
  const resize = `${String(size.width)}x${String(size.height)}`;
  const webp = path.join(HERO_DIR, `${name}.webp`);
  const png = path.join(HERO_DIR, `${name}.png`);
  execFileSync('magick', [source, '-resize', resize, '-quality', WEBP_QUALITY, webp]);
  execFileSync('magick', [source, '-resize', resize, '-colors', PNG_COLOURS, '-strip', png]);
  return [webp, png];
}

async function main(): Promise<void> {
  mkdirSync(HERO_DIR, { recursive: true });
  const server = await createServer({ server: { port: PORT, strictPort: true } });
  await server.listen();
  const source = path.join(HERO_DIR, 'source.png');
  try {
    await capture(`http://localhost:${String(PORT)}`, source);
  } finally {
    await server.close();
  }
  const files = [...encode(source, WIDE, 'hero-1920'), ...encode(source, NARROW, 'hero-960')];
  rmSync(source);
  files.forEach((file) => {
    process.stdout.write(`${path.basename(file)} ${String(statSync(file).size)} B\n`);
  });
}

await main();
