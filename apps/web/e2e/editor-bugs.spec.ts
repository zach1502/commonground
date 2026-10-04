import { expect, test, type Page } from '@playwright/test';

import type {} from '../src/editor/test-hook.ts';

import en from '../src/locales/en.json' with { type: 'json' };

import { createRecordedProject } from './context-project.ts';
import { expectBusStopToggle, expectEntranceSnap, openRecordedEditor } from './context-steps.ts';
import {
  clickGround,
  dragGround,
  editorState,
  holdBrush,
  openEditor,
  pickCatalogItem,
  placeAtFarCorner,
  type GroundPoint,
} from './editor-page.ts';

const { editor } = en;
const BENCH: GroundPoint = { x: 60, y: 50 };
const MOVE_M = 6;
const ORBIT_PRESSES = 4;
const POSE_DIGITS = 3;
// Longer than the autosave delay and one metrics debounce, so a save and a report both land.
const SETTLE_MS = 1500;
const WHEEL_STEPS = 50;
const WHEEL_DELTA_PX = 120;
const MIN_DISTANCE_M = 4;
const GROUND_CLEARANCE_M = 0.5;
// The 176 by 86 m parcel, with room for the island skirt and a margin around it.
const MAX_DISTANCE_M = 600;
const TREE_TOP_FRACTION = 0.6;
// Spots on open ground, clear of the items the specs place.
const AWAY_M = 20;
const FAR_AWAY_M = 30;
const HALF = 2;
// The zoom limits allow for floating point in the distance the browser reports.
const ROUNDING_M = 0.01;
const FIR_HEIGHT_M = 35;
// A drag across the upper part of the canvas, on open ground, and long enough for damping to end.
const DRAG_FROM = 0.2;
const DRAG_PX = 160;
const DRAG_STEPS = 12;
const INERTIA_MS = 4000;

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

interface Pose {
  readonly position: { x: number; y: number; z: number };
  readonly target: { x: number; y: number; z: number };
  readonly groundM: number;
}

async function cameraPose(page: Page): Promise<Pose> {
  const pose = await page.evaluate(() => window.__parkshapeEditor?.cameraPose() ?? null);
  if (pose === null) throw new Error('no camera pose');
  return pose;
}

function expectSamePose(after: Pose, before: Pose, step: string): void {
  for (const part of ['position', 'target'] as const) {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(after[part][axis], `${step}: ${part}.${axis}`).toBeCloseTo(
        before[part][axis],
        POSE_DIGITS,
      );
    }
  }
}

/** Turns the camera away from the reset view with the arrow keys on the focused canvas. */
async function orbitAway(page: Page): Promise<Pose> {
  const before = await cameraPose(page);
  await page.locator('canvas').first().focus();
  for (let press = 0; press < ORBIT_PRESSES; press += 1) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const after = await cameraPose(page);
  expect(after.position.x).not.toBeCloseTo(before.position.x, 1);
  return after;
}

async function placeBench(page: Page, at: GroundPoint = BENCH): Promise<string> {
  const before = (await editorState(page)).document.items.map((item) => item.id);
  await pickCatalogItem(page, 'seating', 'bench');
  await clickGround(page, at);
  await expect
    .poll(async () => (await editorState(page)).document.items.length)
    .toBe(before.length + 1);
  await page.keyboard.press('Escape');
  const added = (await editorState(page)).document.items.find((item) => !before.includes(item.id));
  if (added === undefined) throw new Error('no bench placed');
  return added.id;
}

async function selectionIds(page: Page): Promise<string[]> {
  const state = (await editorState(page)) as unknown as {
    selection: readonly { id: string }[];
  };
  return state.selection.map((ref) => ref.id);
}

async function selectBench(page: Page, id: string, at: GroundPoint): Promise<void> {
  await clickGround(page, at);
  await expect.poll(async () => selectionIds(page)).toEqual([id]);
}

async function distanceToTarget(page: Page): Promise<{ distance: number; height: number }> {
  const pose = await cameraPose(page);
  const { position, target } = pose;
  const distance = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
  return { distance, height: position.y };
}

/** Places a bench, clears the selection, clicks the bench and checks both side panels. */
async function expectSelectionDetails(page: Page): Promise<void> {
  await openEditor(page);
  const id = await placeBench(page);
  await clickGround(page, { x: BENCH.x + AWAY_M, y: BENCH.y + AWAY_M });
  await expect.poll(async () => selectionIds(page)).toEqual([]);
  await selectBench(page, id, BENCH);
  const details = page.getByRole('complementary', { name: editor.properties.heading });
  await expect(details.getByRole('heading', { name: en.catalog.bench })).toBeVisible();
  await expect(details.getByText(editor.categories.seating, { exact: true })).toBeVisible();
  await expect(details.getByText('$3,500', { exact: true }).first()).toBeVisible();
  await expect(details.getByLabel(editor.properties.x)).toBeVisible();
  await expect(details.getByLabel(editor.properties.rotation)).toBeVisible();
  const brief = details.locator('.web-brief-selection');
  await expect(brief).toBeVisible();
  await expect(brief).toContainText(en.catalog.bench);
}

test.describe('owner bug 1: the camera stays put through edits', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the camera holds its orbit through rotate, duplicate, move, delete, undo and redo', async ({
    page,
  }) => {
    await openEditor(page);
    const id = await placeBench(page);
    const pose = await orbitAway(page);
    await selectBench(page, id, BENCH);
    expectSamePose(await cameraPose(page), pose, 'select');
    const steps: readonly [string, () => Promise<void>][] = [
      ['rotate', async () => page.keyboard.press('r')],
      ['duplicate', async () => page.keyboard.press('Control+d')],
      ['undo', async () => page.keyboard.press('Control+z')],
      ['redo', async () => page.keyboard.press('Control+Shift+z')],
      ['undo again', async () => page.keyboard.press('Control+z')],
      [
        'move',
        async () => {
          await selectBench(page, id, BENCH);
          await dragGround(page, BENCH, { x: BENCH.x + MOVE_M, y: BENCH.y });
          await expect
            .poll(async () => (await editorState(page)).document.items.find((i) => i.id === id))
            .toMatchObject({ position: { x: BENCH.x + MOVE_M, y: BENCH.y } });
        },
      ],
      ['delete', async () => page.keyboard.press('Delete')],
      ['autosave and meters', async () => page.waitForTimeout(SETTLE_MS)],
    ];
    for (const [name, run] of steps) {
      await run();
      await page.waitForTimeout(SETTLE_MS);
      expectSamePose(await cameraPose(page), pose, name);
    }
  });

  test('the camera holds its orbit through a terraform stroke', async ({ page }) => {
    await openEditor(page);
    const pose = await orbitAway(page);
    await page.getByRole('button', { name: editor.tools.terraform }).click();
    await holdBrush(page, { x: 75, y: 75 });
    await page.waitForTimeout(SETTLE_MS);
    expectSamePose(await cameraPose(page), pose, 'terraform');
  });
});

test.describe('owner bug 1 with motion on: a mouse orbit leaves no inertia for an edit', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ reducedMotion: 'no-preference' });

  test('the camera holds after a drag orbit settles, through select, rotate and delete', async ({
    page,
  }) => {
    await openEditor(page);
    const id = await placeBench(page);
    await page.keyboard.press('Escape');
    const canvas = await page.locator('canvas').first().boundingBox();
    if (canvas === null) throw new Error('no canvas');
    const from = { x: canvas.x + canvas.width / HALF, y: canvas.y + canvas.height * DRAG_FROM };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + DRAG_PX, from.y, { steps: DRAG_STEPS });
    await page.mouse.up();
    await page.waitForTimeout(INERTIA_MS);
    const pose = await cameraPose(page);
    const steps: readonly [string, () => Promise<void>][] = [
      ['select', async () => selectBench(page, id, BENCH)],
      ['rotate', async () => page.keyboard.press('r')],
      ['delete', async () => page.keyboard.press('Delete')],
    ];
    for (const [name, run] of steps) {
      await run();
      await page.waitForTimeout(SETTLE_MS);
      expectSamePose(await cameraPose(page), pose, name);
    }
  });
});

test.describe('owner bug 2: a click shows properties and the brief note', () => {
  test.describe.configure({ timeout: 120_000 });

  test('clicking an item shows its name, kind, cost and fields, and the brief names it', async ({
    page,
  }) => {
    await expectSelectionDetails(page);
  });
});

test.describe('owner bug 2 with motion on, as residents see it', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ reducedMotion: 'no-preference' });

  test('the properties and the brief note show after the panel slides in', async ({ page }) => {
    await expectSelectionDetails(page);
  });
});

test.describe('owner bug 3: a click anywhere on a model selects it', () => {
  test.describe.configure({ timeout: 120_000 });

  test('clicking the upper half of a tree selects it', async ({ page }) => {
    await openEditor(page);
    const spot = { x: 70, y: 40 };
    const before = (await editorState(page)).document.items.map((item) => item.id);
    await pickCatalogItem(page, 'plants', 'douglas-fir');
    await clickGround(page, spot);
    await expect
      .poll(async () => (await editorState(page)).document.items.length)
      .toBe(before.length + 1);
    await page.keyboard.press('Escape');
    const tree = (await editorState(page)).document.items.find((item) => !before.includes(item.id));
    if (tree === undefined) throw new Error('no tree placed');
    await clickGround(page, { x: spot.x + FAR_AWAY_M, y: spot.y + FAR_AWAY_M });
    await expect.poll(async () => selectionIds(page)).toEqual([]);
    const top = await page.evaluate(
      ({ point, lift }) => window.__parkshapeEditor?.screenPointOf(point, lift) ?? null,
      { point: spot, lift: FIR_HEIGHT_M * TREE_TOP_FRACTION },
    );
    if (top === null) throw new Error('tree top is off screen');
    await page.mouse.move(top.x, top.y);
    await page.mouse.click(top.x, top.y);
    await expect.poll(async () => selectionIds(page)).toEqual([tree.id]);
  });
});

test.describe('owner bug 4: zoom limits', () => {
  test.describe.configure({ timeout: 120_000 });

  test('scrolling 50 steps in or out keeps the camera between 4 m and the parcel framing', async ({
    page,
  }) => {
    await openEditor(page);
    const canvas = await page.locator('canvas').first().boundingBox();
    if (canvas === null) throw new Error('no canvas');
    await page.mouse.move(canvas.x + canvas.width / HALF, canvas.y + canvas.height / HALF);
    for (let step = 0; step < WHEEL_STEPS; step += 1) {
      await page.mouse.wheel(0, -WHEEL_DELTA_PX);
    }
    await page.waitForTimeout(SETTLE_MS);
    const near = await distanceToTarget(page);
    expect(near.distance).toBeGreaterThanOrEqual(MIN_DISTANCE_M - ROUNDING_M);
    const pose = await cameraPose(page);
    expect(pose.position.y - pose.groundM).toBeGreaterThanOrEqual(GROUND_CLEARANCE_M);
    for (let step = 0; step < WHEEL_STEPS; step += 1) {
      await page.mouse.wheel(0, WHEEL_DELTA_PX);
    }
    await page.waitForTimeout(SETTLE_MS);
    const far = await distanceToTarget(page);
    expect(far.distance).toBeLessThanOrEqual(MAX_DISTANCE_M);
  });

  test('the plus and minus keys stay inside the same zoom limits', async ({ page }) => {
    await openEditor(page);
    await page.locator('canvas').first().focus();
    for (let step = 0; step < WHEEL_STEPS; step += 1) await page.keyboard.press('+');
    const near = await distanceToTarget(page);
    expect(near.distance).toBeGreaterThanOrEqual(MIN_DISTANCE_M - ROUNDING_M);
    for (let step = 0; step < WHEEL_STEPS; step += 1) await page.keyboard.press('-');
    const far = await distanceToTarget(page);
    expect(far.distance).toBeLessThanOrEqual(MAX_DISTANCE_M);
  });
});

test.describe('leftover A: the floating toolbar stays inside the canvas', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the toolbar for an item at the far corner is inside the canvas', async ({ page }) => {
    await openEditor(page);
    const canvas = await page.locator('canvas').first().boundingBox();
    if (canvas === null) throw new Error('no canvas');
    await placeAtFarCorner(page, canvas);
    const toolbar = page.getByRole('toolbar', { name: editor.toolbar.label });
    await expect(toolbar).toBeVisible();
    await expect
      .poll(async () => {
        const box = await toolbar.boundingBox();
        if (box === null) return 'no box';
        const inside =
          box.x >= canvas.x &&
          box.y >= canvas.y &&
          box.x + box.width <= canvas.x + canvas.width &&
          box.y + box.height <= canvas.y + canvas.height;
        return inside ? 'inside' : JSON.stringify({ box, canvas });
      })
      .toBe('inside');
  });
});

test.describe('owner steer: map layers and the entrance snap on the recorded park', () => {
  test.describe.configure({ timeout: 120_000 });
  let projectId = '';

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    projectId = await createRecordedProject(request);
    await request.dispose();
  });

  test('Bus stops toggles the pins; a path end by the sidewalk snaps', async ({ page }) => {
    await openRecordedEditor(page, projectId);
    await expectBusStopToggle(page);
    await expectEntranceSnap(page, '../../artifacts/screens/context/editor-snap-marker.png');
  });
});
