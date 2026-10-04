import { describe, expect, it } from 'vitest';

import { docOf } from '../test-fixtures.js';

import { beginArea, dragAreaTo } from './areas.js';
import { addPathPoint } from './paths.js';
import { startPlacing } from './placing.js';
import { contextFor } from './test-context.js';

// The south-west half of the 60 m test square.
const TRIANGLE = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 0, y: 60 },
];
const empty = docOf({ items: [] });

describe('path points on a triangular parcel', () => {
  it('refuses a path point outside the triangle and keeps the draft', () => {
    const ctx = contextFor(empty, [], TRIANGLE);
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 10, y: 10 });
    addPathPoint(ctx, { x: 50, y: 50 });
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'path', draft: [{ x: 10, y: 10 }] });
  });
});

describe('areas on a triangular parcel', () => {
  it('refuses to start an area outside the triangle', () => {
    const ctx = contextFor(empty, [], TRIANGLE);
    startPlacing(ctx, 'community-garden');
    beginArea(ctx, { x: 50, y: 50 });
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'area', draft: null });
  });

  it('keeps the last fitting corner when a drag would take a corner past the long side', () => {
    const ctx = contextFor(empty, [], TRIANGLE);
    startPlacing(ctx, 'community-garden');
    beginArea(ctx, { x: 5, y: 5 });
    dragAreaTo(ctx, { x: 20, y: 20 });
    dragAreaTo(ctx, { x: 40, y: 40 });
    expect(ctx.store.getState().tool).toMatchObject({
      kind: 'area',
      draft: { start: { x: 5, y: 5 }, end: { x: 20, y: 20 } },
    });
  });
});
