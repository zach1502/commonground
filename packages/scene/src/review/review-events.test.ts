import type { ThreeEvent } from '@react-three/fiber';
import { describe, expect, it, vi } from 'vitest';

import { catalogIndex, type DesignDocument } from '@parkshape/core';

import { docOf } from '../editor/test-fixtures.js';

import { REVIEW_CLICK_SLOP_PX, reviewTerrainEvents } from './review-events.js';

const RAY_HEIGHT_M = 60;

const design = docOf({
  items: [
    {
      id: 'bench-1',
      catalogId: 'bench',
      position: { x: 10, y: 10 },
      rotationDeg: 0,
      locked: false,
    },
  ],
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** A click on the ground at a plan point, from a ray straight down. */
function clickAt(point: { x: number; y: number }, delta = 0): ThreeEvent<MouseEvent> {
  return {
    delta,
    distance: RAY_HEIGHT_M,
    point: { x: point.x, y: 0, z: point.y },
    ray: {
      origin: { x: point.x, y: RAY_HEIGHT_M, z: point.y },
      direction: { x: 0, y: -1, z: 0 },
    },
  } as unknown as ThreeEvent<MouseEvent>;
}

function eventsFor(document: DesignDocument) {
  const onSelect = vi.fn();
  const events = reviewTerrainEvents({
    design: document,
    catalog: catalogIndex,
    elevationAt: () => 0,
    onSelect,
  });
  return { events, onSelect };
}

describe('reviewTerrainEvents', () => {
  it('listens to clicks only, so no drag, double click or menu can edit the design', () => {
    expect(Object.keys(eventsFor(design).events)).toEqual(['onClick']);
  });

  it('selects the item under a tap', () => {
    const { events, onSelect } = eventsFor(design);
    events.onClick?.(clickAt({ x: 10, y: 10 }));
    expect(onSelect).toHaveBeenCalledWith({ elementId: 'bench-1', elementKind: 'item' }, undefined);
  });

  it('ignores a press that moved like an orbit drag', () => {
    const { events, onSelect } = eventsFor(design);
    events.onClick?.(clickAt({ x: 10, y: 10 }, REVIEW_CLICK_SLOP_PX + 1));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does nothing on bare ground', () => {
    const { events, onSelect } = eventsFor(design);
    events.onClick?.(clickAt({ x: 90, y: 90 }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves the design as it was', () => {
    const frozen = deepFreeze(docOf({ items: design.items }));
    const before = JSON.stringify(frozen);
    const { events } = eventsFor(frozen);
    expect(() => events.onClick?.(clickAt({ x: 10, y: 10 }))).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });
});
