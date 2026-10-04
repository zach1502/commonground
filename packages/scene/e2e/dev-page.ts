import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { SceneInspector } from '../src/components/inspect.ts';
import type { OfflineFrame } from '../src/perf/render-preset.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** The dev page modes: which park it draws and which render tier it forces. */
export interface DevPageMode {
  readonly park?: 'ramp' | 'seed' | 'baseline';
  readonly tier?: 'desktop' | 'phone';
  /** Draws the recorded street context: the default layers or every layer. */
  readonly context?: 'defaults' | 'all';
}

/** True when Playwright's Chromium is installed; the scene e2e tests skip without it. */
export function hasChromium(): boolean {
  return existsSync(chromium.executablePath());
}

/** The dev page URL for a mode; with no mode it draws the synthetic ramp at the probed tier. */
export function devPageUrl(mode: DevPageMode = {}): string {
  const query = new URLSearchParams();
  if (mode.park !== undefined) query.set('park', mode.park);
  if (mode.tier !== undefined) query.set('tier', mode.tier);
  if (mode.context !== undefined) query.set('context', mode.context);
  const search = query.toString();
  return search === '' ? '/' : `/?${search}`;
}

/** Opens the dev page and waits until the scene has loaded and drawn the given number of frames. */
export async function openScene(page: Page, frames: number, mode: DevPageMode = {}): Promise<void> {
  await page.goto(devPageUrl(mode));
  await page.waitForFunction(() => window.__parkshapeReady);
  // The canvas wrapper says so too, after the first frames with textures have drawn.
  await page.locator('[data-scene-ready="true"]').waitFor();
  await page.waitForFunction((count) => window.__parkshapeFrameTimes.length >= count, frames);
}

type ThumbnailPixels = () => Promise<number[]>;
type ThumbnailFacts = () => Promise<{ type: string; meanLuminance: number }>;
type DevAction = () => void;
type RenderOffline = (frame: OfflineFrame) => Promise<string>;

declare global {
  interface Window {
    __parkshapeFrameTimes: number[];
    __parkshapeReady: boolean;
    __parkshapeTier: string;
    /** Renders a thumbnail of the dev scene and returns centre then corner RGBA. */
    __parkshapeThumbnailPixels: ThumbnailPixels;
    /** Renders a thumbnail and returns its image type and mean luminance out of 255. */
    __parkshapeThumbnailFacts: ThumbnailFacts;
    __parkshapeInspect: SceneInspector;
    __parkshapeNudge: DevAction;
    /** The dev scene as one offline still, base64, drawn with renderPreset('offline'). */
    __parkshapeRenderOffline: RenderOffline;
  }
}

/** RGB of one pixel of a page screenshot, decoded in the browser so Node needs no PNG library. */
export async function screenPixel(page: Page, point: { x: number; y: number }): Promise<number[]> {
  const png = (await page.screenshot({ clip: { ...point, width: 1, height: 1 } })).toString(
    'base64',
  );
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d');
    context?.drawImage(bitmap, 0, 0);
    const rgb = 3;
    return [...(context?.getImageData(0, 0, 1, 1).data.slice(0, rgb) ?? [])];
  }, png);
}
