import { expect, type Page } from '@playwright/test';

import type {} from '../src/editor/test-hook.ts';
import contextText from '../src/locales/en.context.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };

import { RESIDENT, signIn } from './app-routes.ts';
import { RECORDED_BUS_STOPS } from './context-project.ts';
import { createDraft } from './design-requests.ts';
import {
  clickGround,
  dismissHints,
  editorState,
  hoverGround,
  waitForCanvas,
} from './editor-page.ts';

const { layers } = contextText;
// A point inside the park, then one inside the north edge, 4.4 m from the W 7th Ave sidewalk
// centreline (y = 87.87 at x = 88). Clicks land only on the parcel's own ground.
const INSIDE = { x: 88, y: 60 };
const NEAR_NORTH_SIDEWALK = { x: 88, y: 83.5 };
// The parcel's north edge crosses x = 88 at y = 82.99; a snapped end sits 1.5 m inside it.
const NORTH_EDGE_Y = 82.99;
const INSET_M = 1.5;
const TOLERANCE_M = 0.3;
// The middle of a pin: the pole is 2.5 m tall with its sign at the top.
const PIN_MIDDLE_M = 1.5;
// A box around the pin, tall enough for the gap between the plan ground and the street ground.
const PIN_BOX = { width: 24, height: 80 } as const;
const HALF = 2;

/** Signs a resident in and opens a new baseline draft of the project in the editor. */
export async function openRecordedEditor(page: Page, projectId: string): Promise<void> {
  await signIn(page, RESIDENT);
  const id = await createDraft(page.request, projectId, { from: 'baseline' });
  await page.goto(`/projects/${projectId}/design/${id}`);
  await waitForCanvas(page);
  await dismissHints(page);
  await expect(page.getByRole('button', { name: layers.menu })).toBeVisible();
}

async function drawnFrames(page: Page): Promise<void> {
  // The editor draws on demand; two animation frames let the last toggle reach the canvas.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

/** The page boxes around the recorded bus stops inside the editor canvas. */
async function shownStopBoxes(page: Page) {
  const canvas = await page.locator('canvas').first().boundingBox();
  if (canvas === null) throw new Error('no editor canvas');
  const boxes = [];
  for (const stop of RECORDED_BUS_STOPS) {
    const point = await page.evaluate(
      ([at, lift]) => window.__parkshapeEditor?.screenPointOf(at, lift) ?? null,
      [stop, PIN_MIDDLE_M] as const,
    );
    if (point === null) continue;
    const box = {
      x: point.x - PIN_BOX.width / HALF,
      y: point.y - PIN_BOX.height / HALF,
      ...PIN_BOX,
    };
    const inside =
      box.x >= canvas.x &&
      box.y >= canvas.y &&
      box.x + box.width <= canvas.x + canvas.width &&
      box.y + box.height <= canvas.y + canvas.height;
    if (inside) boxes.push(box);
  }
  if (boxes.length === 0) throw new Error('the editor camera shows none of the recorded bus stops');
  return boxes;
}

async function shotsOf(
  page: Page,
  clips: readonly Awaited<ReturnType<typeof shownStopBoxes>>[0][],
) {
  const shots = [];
  for (const clip of clips) shots.push(await page.screenshot({ clip }));
  return shots;
}

async function setBusStops(page: Page, state: 'on' | 'off'): Promise<void> {
  await page.getByRole('button', { name: layers.menu }).click();
  const box = page.getByRole('checkbox', { name: layers.kinds.busStop });
  await box.setChecked(state === 'on');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await drawnFrames(page);
}

/** Bus stops off clears the pins and their legend row; on draws at least one shown pin again. */
export async function expectBusStopToggle(page: Page): Promise<void> {
  const clips = await shownStopBoxes(page);
  const legend = page.locator('[data-context-legend]');
  await setBusStops(page, 'off');
  await expect(legend.getByText(layers.legend.busStop, { exact: true })).toHaveCount(0);
  const off = await shotsOf(page, clips);
  await setBusStops(page, 'on');
  await expect(legend.getByText(layers.legend.busStop, { exact: true })).toBeVisible();
  const on = await shotsOf(page, clips);
  const redrawn = on.filter((shot, index) => !shot.equals(off[index] ?? Buffer.alloc(0)));
  expect(redrawn.length).toBeGreaterThan(0);
}

/** A path ended 4.4 m from the north sidewalk shows the marker and snaps inside the edge. */
export async function expectEntranceSnap(page: Page, shot: string): Promise<void> {
  await page.getByRole('button', { name: en.editor.tools.path, exact: true }).click();
  await clickGround(page, INSIDE);
  await hoverGround(page, NEAR_NORTH_SIDEWALK);
  await expect
    .poll(() => page.evaluate(() => window.__parkshapeEditor?.getState().entranceMarker ?? null))
    .not.toBeNull();
  await page.screenshot({ path: shot });
  await clickGround(page, NEAR_NORTH_SIDEWALK);
  // Enter on the focused Path button would press it again, so the finish key goes to the page.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Enter');
  const state = await editorState(page);
  const end = state.document.paths.at(-1)?.points.at(-1);
  expect(end?.x).toBeCloseTo(NEAR_NORTH_SIDEWALK.x, 0);
  expect(Math.abs((end?.y ?? 0) - (NORTH_EDGE_Y - INSET_M))).toBeLessThan(TOLERANCE_M);
}
