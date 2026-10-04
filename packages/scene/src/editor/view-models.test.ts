import { describe, expect, it } from 'vitest';

import { catalogIndex, catalogItems } from '@parkshape/core';

import { itemsListRows } from './items-list.js';
import { lockedOutlines, selectionAnchor, toolbarAnchor } from './overlays.js';
import { paletteGroups } from './palette.js';
import { propertiesOf } from './properties.js';
import { screenSize } from './screen.js';
import { docOf, square, treeInput } from './test-fixtures.js';

const doc = docOf({
  items: [treeInput('t1', 10, 10), { ...treeInput('old', 20, 20, 'locked'), catalogId: 'bench' }],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    },
  ],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: square(30, 30, 10), locked: false }],
});

describe('paletteGroups', () => {
  it('groups point, path and area entries into picker tabs in catalog order', () => {
    const groups = paletteGroups(catalogItems);
    expect(groups[0]?.group).toBe('plants');
    expect(groups[0]?.entries[0]?.id).toBe('bigleaf-maple');
    expect(groups.map((group) => group.group)).toContain('paths');
    const ids = groups.flatMap((group) => group.entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(catalogItems.length);
  });
});

describe('propertiesOf', () => {
  it('shows nothing without a selection', () => {
    expect(propertiesOf(doc, [], catalogIndex)).toEqual({ kind: 'none' });
  });

  it('shows the kind, unit cost, exact position and rotation of one item', () => {
    expect(propertiesOf(doc, [{ kind: 'item', id: 't1' }], catalogIndex)).toEqual({
      kind: 'item',
      id: 't1',
      catalogId: 'bigleaf-maple',
      category: 'tree',
      costCad: 1200,
      x: 10,
      y: 10,
      rotationDeg: 0,
    });
  });

  it('shows the area and plots of one area, and the length of one path', () => {
    expect(propertiesOf(doc, [{ kind: 'area', id: 'a1' }], catalogIndex)).toMatchObject({
      kind: 'area',
      id: 'a1',
      areaM2: 100,
      plots: 10,
    });
    expect(propertiesOf(doc, [{ kind: 'path', id: 'p1' }], catalogIndex)).toEqual({
      kind: 'path',
      id: 'p1',
      surface: 'gravel',
      lengthM: 5,
      points: 2,
    });
  });

  it('counts a multi-selection', () => {
    const refs = [
      { kind: 'item' as const, id: 't1' },
      { kind: 'path' as const, id: 'p1' },
    ];
    expect(propertiesOf(doc, refs, catalogIndex)).toEqual({ kind: 'many', count: 2 });
  });

  it('falls back to nothing for a stale reference', () => {
    expect(propertiesOf(doc, [{ kind: 'item', id: 'gone' }], catalogIndex)).toEqual({
      kind: 'none',
    });
  });
});

describe('itemsListRows', () => {
  it('lists every element with its place, lock and selection state', () => {
    const rows = itemsListRows(doc, [{ kind: 'item', id: 't1' }]);
    expect(rows).toEqual([
      {
        kind: 'item',
        id: 't1',
        catalogId: 'bigleaf-maple',
        x: 10,
        y: 10,
        locked: 'free',
        selected: 'selected',
      },
      {
        kind: 'item',
        id: 'old',
        catalogId: 'bench',
        x: 20,
        y: 20,
        locked: 'locked',
        selected: 'not-selected',
      },
      {
        kind: 'path',
        id: 'p1',
        catalogId: 'path-gravel',
        x: 0,
        y: 0,
        locked: 'free',
        selected: 'not-selected',
      },
      {
        kind: 'area',
        id: 'a1',
        catalogId: 'community-garden',
        x: 30,
        y: 30,
        locked: 'free',
        selected: 'not-selected',
      },
    ]);
  });
});

describe('overlays', () => {
  it('outlines each locked item footprint as a turned rectangle', () => {
    const [outline] = lockedOutlines(doc, catalogIndex);
    expect(outline?.id).toBe('old');
    expect(outline?.polygon).toHaveLength(4);
    expect(outline?.polygon[0]?.x).toBeCloseTo(19.1);
    expect(outline?.polygon[0]?.y).toBeCloseTo(19.5);
  });

  it('anchors the floating toolbar at the middle of the selection', () => {
    expect(
      selectionAnchor(doc, [
        { kind: 'item', id: 't1' },
        { kind: 'area', id: 'a1' },
      ]),
    ).toEqual({
      x: 22.5,
      y: 22.5,
    });
    expect(selectionAnchor(doc, [])).toBeNull();
  });

  it('shows the floating toolbar only with the Select tool, so it never takes a drawing click', () => {
    const selection = [{ kind: 'item', id: 't1' }] as const;
    expect(toolbarAnchor(doc, selection, { kind: 'select' })).toEqual({ x: 10, y: 10 });
    expect(
      toolbarAnchor(doc, selection, { kind: 'path', surface: 'gravel', draft: [] }),
    ).toBeNull();
    expect(
      toolbarAnchor(doc, selection, { kind: 'area', catalogId: 'lawn', draft: null }),
    ).toBeNull();
    expect(toolbarAnchor(doc, selection, { kind: 'place', catalogId: 'bench' })).toBeNull();
    expect(toolbarAnchor(doc, selection, { kind: 'terraform' })).toBeNull();
  });
});

describe('screenSize', () => {
  it('treats anything under 1024 px as small', () => {
    expect(screenSize(1023)).toBe('small');
    expect(screenSize(1024)).toBe('desktop');
  });
});
