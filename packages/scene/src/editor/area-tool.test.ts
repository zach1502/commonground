import { describe, expect, it } from 'vitest';

import { catalogIndex, type AreaCatalogItem } from '@parkshape/core';

import { addCorner, areaSummary, moveEdge, moveVertex, rectangleFromDrag } from './area-tool.js';

function gardenEntry(): AreaCatalogItem {
  const entry = catalogIndex.get('community-garden');
  if (entry?.geometryKind !== 'area') throw new Error('catalog has no community garden');
  return entry;
}

describe('rectangleFromDrag', () => {
  it('builds a counter-clockwise rectangle from any two corners', () => {
    const expected = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];
    expect(rectangleFromDrag({ x: 0, y: 0 }, { x: 10, y: 5 })).toEqual(expected);
    expect(rectangleFromDrag({ x: 10, y: 5 }, { x: 0, y: 0 })).toEqual(expected);
  });
});

describe('editing an outline', () => {
  const outline = rectangleFromDrag({ x: 0, y: 0 }, { x: 10, y: 10 });

  it('moves one corner', () => {
    expect(moveVertex(outline, 2, { x: 12, y: 11 })[2]).toEqual({ x: 12, y: 11 });
  });

  it('moves an edge by moving both of its corners', () => {
    const moved = moveEdge(outline, 1, { x: 3, y: 0 });
    expect(moved[1]).toEqual({ x: 13, y: 0 });
    expect(moved[2]).toEqual({ x: 13, y: 10 });
    expect(moved[0]).toEqual({ x: 0, y: 0 });
  });

  it('moves the closing edge from the last corner back to the first', () => {
    const moved = moveEdge(outline, 3, { x: -2, y: 0 });
    expect(moved[3]).toEqual({ x: -2, y: 10 });
    expect(moved[0]).toEqual({ x: -2, y: 0 });
  });

  it('adds a corner on the edge nearest the point', () => {
    const added = addCorner(outline, { x: 11, y: 4 });
    expect(added).toHaveLength(5);
    expect(added[2]).toEqual({ x: 10, y: 4 });
  });

  it('clamps a new corner to the ends of the edge', () => {
    const added = addCorner(outline, { x: 5, y: -3 });
    expect(added[1]).toEqual({ x: 5, y: 0 });
  });
});

describe('areaSummary', () => {
  it('reports the area and the plots the core module fitting finds', () => {
    const summary = areaSummary(
      gardenEntry(),
      rectangleFromDrag({ x: 0, y: 0 }, { x: 12.4, y: 11.4 }),
    );
    expect(summary.areaM2).toBeCloseTo(141.36);
    expect(summary.plots).toBe(18);
    expect(summary.size).toBe('ok');
  });

  it('flags an area below the catalog minimum', () => {
    const summary = areaSummary(gardenEntry(), rectangleFromDrag({ x: 0, y: 0 }, { x: 5, y: 5 }));
    expect(summary).toMatchObject({ areaM2: 25, plots: 2, size: 'too-small', minAreaM2: 40 });
  });
});
