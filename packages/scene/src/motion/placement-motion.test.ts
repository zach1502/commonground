import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { addItem, batch, deleteItem, moveItem } from '../editor/commands.js';
import { GHOST_OPACITY } from '../editor/overlay-style.js';
import { docOf, treeInput } from '../editor/test-fixtures.js';

import {
  veilOpacity,
  placementLook,
  placementMotionOf,
  PlacementTween,
  SETTLE_DROP_M,
} from './placement-motion.js';

const tree = docOf({ items: [treeInput('t1', 10, 10)] }).items[0];
if (tree === undefined) throw new Error('fixture has a tree');
const START = new Date('2026-10-01T12:00:00Z');

describe('placementMotionOf', () => {
  it('settles an item placed with a click', () => {
    const motion = placementMotionOf({ step: 'execute', spec: addItem(tree), serial: 1 });
    expect(motion).toEqual({ kind: 'settle', items: [tree], serial: 1 });
  });

  it('lifts the item out on undo of a place, and settles it again on redo', () => {
    expect(placementMotionOf({ step: 'undo', spec: addItem(tree), serial: 2 })?.kind).toBe('lift');
    expect(placementMotionOf({ step: 'redo', spec: addItem(tree), serial: 3 })?.kind).toBe(
      'settle',
    );
  });

  it('settles the items back on undo of a delete, and lifts them on redo', () => {
    const spec = batch([deleteItem(tree, 0)]);
    expect(placementMotionOf({ step: 'undo', spec, serial: 4 })).toEqual({
      kind: 'settle',
      items: [tree],
      serial: 4,
    });
    expect(placementMotionOf({ step: 'redo', spec, serial: 5 })?.kind).toBe('lift');
  });

  it('keeps a plain delete, a duplicate and every other command instant', () => {
    expect(placementMotionOf({ step: 'execute', spec: deleteItem(tree, 0), serial: 6 })).toBeNull();
    expect(
      placementMotionOf({ step: 'execute', spec: batch([addItem(tree)]), serial: 7 }),
    ).toBeNull();
    const move = moveItem(tree.id, { x: 1, y: 1 }, { x: 2, y: 2 });
    expect(placementMotionOf({ step: 'undo', spec: move, serial: 8 })).toBeNull();
    expect(placementMotionOf(null)).toBeNull();
  });
});

describe('placementLook', () => {
  it('drops from 0.15 m up at ghost opacity to the ground at full opacity in 150 ms', () => {
    expect(placementLook(0, { kind: 'settle', motion: 'full' })).toEqual({
      offsetM: SETTLE_DROP_M,
      opacity: GHOST_OPACITY,
    });
    const middle = placementLook(75, { kind: 'settle', motion: 'full' });
    expect(middle.offsetM).toBeGreaterThan(0);
    expect(middle.offsetM).toBeLessThan(SETTLE_DROP_M);
    expect(middle.opacity).toBeGreaterThan(GHOST_OPACITY);
    expect(placementLook(150, { kind: 'settle', motion: 'full' })).toEqual({
      offsetM: 0,
      opacity: 1,
    });
  });

  it('never goes under the ground, so there is no bounce', () => {
    for (let ms = 0; ms <= 200; ms += 5) {
      const look = placementLook(ms, { kind: 'settle', motion: 'full' });
      expect(look.offsetM).toBeGreaterThanOrEqual(0);
      expect(look.offsetM).toBeLessThanOrEqual(SETTLE_DROP_M);
    }
  });

  it('plays the settle in reverse for a lift: rises 0.15 m and fades out', () => {
    expect(placementLook(0, { kind: 'lift', motion: 'full' })).toEqual({ offsetM: 0, opacity: 1 });
    expect(placementLook(150, { kind: 'lift', motion: 'full' })).toEqual({
      offsetM: SETTLE_DROP_M,
      opacity: 0,
    });
  });

  it('is solid on the ground at once, or gone at once, under reduced motion', () => {
    expect(placementLook(0, { kind: 'settle', motion: 'reduced' })).toEqual({
      offsetM: 0,
      opacity: 1,
    });
    expect(placementLook(0, { kind: 'lift', motion: 'reduced' }).opacity).toBe(0);
  });
});

describe('veilOpacity', () => {
  it('starts a settle at the ghost opacity and clears by its end', () => {
    expect(veilOpacity(placementLook(0, { kind: 'settle', motion: 'full' }))).toBe(GHOST_OPACITY);
    expect(veilOpacity(placementLook(150, { kind: 'settle', motion: 'full' }))).toBe(0);
  });

  it('rises from 0 to the ghost opacity over a lift', () => {
    expect(veilOpacity(placementLook(0, { kind: 'lift', motion: 'full' }))).toBe(0);
    expect(veilOpacity(placementLook(150, { kind: 'lift', motion: 'full' }))).toBe(GHOST_OPACITY);
  });
});

describe('PlacementTween', () => {
  it('reads the look from a clock and finishes at 150 ms', () => {
    const clock = new FakeClock(START);
    const tween = new PlacementTween({ kind: 'settle', motion: 'full' }, clock);
    expect(tween.look().offsetM).toBe(SETTLE_DROP_M);
    clock.advance(75);
    expect(tween.state()).toBe('running');
    clock.advance(75);
    expect(tween.look()).toEqual({ offsetM: 0, opacity: 1 });
    expect(tween.state()).toBe('done');
  });
});
