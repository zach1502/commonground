import { expect, type Page } from '@playwright/test';

import type {} from '../src/editor/test-hook.ts';
import en from '../src/locales/en.json' with { type: 'json' };

import { RESIDENT, signIn } from './app-routes.ts';
import { createDraft, firstProjectId, type DraftSource } from './design-requests.ts';

export interface GroundPoint {
  readonly x: number;
  readonly y: number;
}

interface HookState {
  readonly document: {
    readonly items: readonly { id: string; position: GroundPoint; locked: boolean }[];
    readonly paths: readonly { points: readonly GroundPoint[] }[];
    readonly areas: readonly { polygon: readonly GroundPoint[] }[];
  };
  readonly snap: string;
}

/** Signs in, starts a design through the API and goes to its editor route. */
export async function openEditorRoute(page: Page, from: DraftSource = 'baseline') {
  await signIn(page, RESIDENT);
  const projectId = await firstProjectId(page.request);
  const id = await createDraft(page.request, projectId, { from });
  const path = `/projects/${projectId}/design/${id}`;
  await page.goto(path);
  return { projectId, designId: id, path };
}

/** Opens a fork of the baseline and waits for the canvas to draw. */
export async function openEditor(
  page: Page,
  options: { hints: 'keep' | 'dismiss' } = { hints: 'dismiss' },
) {
  const opened = await openEditorRoute(page);
  await waitForCanvas(page);
  if (options.hints === 'dismiss') await dismissHints(page);
  return opened;
}

/** Dismisses any first-visit hints so they do not sit over the canvas during a spec. */
export async function dismissHints(page: Page) {
  const dismiss = page.getByRole('button', { name: en.editor.hints.dismiss });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
}

export async function waitForCanvas(page: Page) {
  await page.waitForFunction(
    () => (window.__parkshapeEditor?.screenPointOf({ x: 0, y: 0 }) ?? null) !== null,
    null,
    { timeout: 60_000 },
  );
  await expect(page.getByText(en.editor.viewer.loadingMessage)).toBeHidden({ timeout: 60_000 });
}

export async function editorState(page: Page): Promise<HookState> {
  return page.evaluate(() => {
    const hook = window.__parkshapeEditor;
    if (hook === undefined) throw new Error('no editor test hook');
    return JSON.parse(JSON.stringify(hook.getState())) as never;
  });
}

export async function screenPoint(page: Page, point: GroundPoint): Promise<GroundPoint> {
  const screen = await page.evaluate(
    (ground) => window.__parkshapeEditor?.screenPointOf(ground) ?? null,
    point,
  );
  if (screen === null) throw new Error(`ground point ${JSON.stringify(point)} is off screen`);
  return screen;
}

export async function hoverGround(page: Page, point: GroundPoint) {
  const screen = await screenPoint(page, point);
  await page.mouse.move(screen.x, screen.y);
}

export async function clickGround(page: Page, point: GroundPoint) {
  await hoverGround(page, point);
  const screen = await screenPoint(page, point);
  await page.mouse.click(screen.x, screen.y);
}

// A brush held this long applies on enough demand frames to change the grade.
const BRUSH_HOLD_MS = 1000;
const BRUSH_FRAME_STEP_MS = 60;

/** Presses on a ground point and holds, nudging the pointer so demand frames keep applying. */
export async function holdBrush(page: Page, point: GroundPoint): Promise<void> {
  const screen = await screenPoint(page, point);
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  const until = Date.now() + BRUSH_HOLD_MS;
  while (Date.now() < until) {
    await page.mouse.move(screen.x + 1, screen.y + 1);
    await page.mouse.move(screen.x, screen.y);
    await page.waitForTimeout(BRUSH_FRAME_STEP_MS);
  }
  await page.mouse.up();
}

export async function dragGround(page: Page, from: GroundPoint, to: GroundPoint) {
  const start = await screenPoint(page, from);
  const end = await screenPoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

type PaletteGroup = keyof typeof en.editor.palette.groups;
type CatalogId = keyof typeof en.catalog;

/** The picker tile for a catalog item: its tab, then the tile named "Bench, $3,500". */
export async function pickCatalogItem(page: Page, group: PaletteGroup, id: CatalogId) {
  await page.getByRole('tab', { name: en.editor.palette.groups[group] }).click();
  await page.getByRole('option', { name: new RegExp(`^${en.catalog[id]}, `) }).click();
}

// Ground points on an 8 m grid over the 176 by 86 m parcel, tried nearest a canvas edge first.
const GRID_STEP_M = 8;
const PARCEL_M = { x: 176, y: 86 };
// Clicks closer than this to the canvas edge can land on the side columns.
const MIN_EDGE_GAP_PX = 24;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const edgeGap = (point: GroundPoint, canvas: Box) =>
  Math.min(
    point.x - canvas.x,
    canvas.x + canvas.width - point.x,
    point.y - canvas.y,
    canvas.y + canvas.height - point.y,
  );

async function edgeSpots(page: Page, canvas: Box): Promise<GroundPoint[]> {
  const grid: GroundPoint[] = [];
  for (let x = GRID_STEP_M; x < PARCEL_M.x; x += GRID_STEP_M) {
    for (let y = GRID_STEP_M; y < PARCEL_M.y; y += GRID_STEP_M) grid.push({ x, y });
  }
  const screens = await page.evaluate(
    (points) => points.map((point) => window.__parkshapeEditor?.screenPointOf(point) ?? null),
    grid,
  );
  return grid
    .map((point, index) => {
      const screen = screens[index];
      return { point, gap: screen === null || screen === undefined ? -1 : edgeGap(screen, canvas) };
    })
    .filter(({ gap }) => gap >= MIN_EDGE_GAP_PX)
    .sort((a, b) => a.gap - b.gap)
    .map(({ point }) => point);
}

/** Places a bench on the open ground drawn nearest a canvas edge, and returns where. */
export async function placeAtFarCorner(page: Page, canvas: Box): Promise<GroundPoint> {
  const before = (await editorState(page)).document.items.length;
  for (const spot of await edgeSpots(page, canvas)) {
    await pickCatalogItem(page, 'seating', 'bench');
    await clickGround(page, spot);
    if ((await editorState(page)).document.items.length > before) return spot;
    await page.keyboard.press('Escape');
  }
  throw new Error('no spot near the canvas edge took the bench');
}
