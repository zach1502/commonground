import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import {
  designOf,
  itemAt,
  rectangle,
  type PolygonInput,
} from '../metrics/fixtures/design-builders.js';
import { polygonContains } from '../schema/geometry.js';
import { itemIdSchema } from '../schema/ids.js';
import { metres } from '../schema/units.js';

import {
  anchorPoint,
  carriedComments,
  elementLabel,
  formatElementLabel,
  resolveAnchor,
} from './comment-anchor.js';
import { elementCommentSchema } from './element-comment.js';

// A U shape: its centroid falls in the notch between the arms, outside the polygon.
const U_SHAPE: PolygonInput = [
  { x: 30, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 30 },
  { x: 50, y: 30 },
  { x: 50, y: 10 },
  { x: 40, y: 10 },
  { x: 40, y: 30 },
  { x: 30, y: 30 },
];

const document = designOf({
  items: [itemAt('bench-1', 'bench', 10, 10)],
  paths: [
    {
      id: 'walk-1',
      surface: 'asphalt',
      widthM: 2,
      points: [
        { x: 0, y: 40 },
        { x: 10, y: 40 },
        { x: 10, y: 60 },
      ],
    },
  ],
  areas: [{ id: 'garden-1', catalogId: 'community-garden', polygon: U_SHAPE, locked: false }],
  zones: [{ id: 'zone-1', kind: 'forbidden', polygon: rectangle(80, 80, 85, 85), label: 'Wet' }],
});

const parcel = rectangle(0, 0, 90, 90);
const id = (value: string) => itemIdSchema.parse(value);
const at = (x: number, y: number) => ({ x: metres(x), y: metres(y) });

describe('resolveAnchor', () => {
  it('takes the kind and category of an item from the document, and drops a surface point', () => {
    const result = resolveAnchor(document, catalogIndex, {
      elementId: 'bench-1',
      surfacePoint: at(1, 1),
    });
    expect(result).toEqual({ ok: true, value: { elementKind: 'item', category: 'seating' } });
  });

  it('keeps a surface point on a path ribbon', () => {
    const surfacePoint = at(5, 40.9);
    const result = resolveAnchor(document, catalogIndex, { elementId: 'walk-1', surfacePoint });
    expect(result).toEqual({
      ok: true,
      value: { elementKind: 'path', category: 'path', surfacePoint },
    });
  });

  it('refuses a surface point off the path ribbon', () => {
    const result = resolveAnchor(document, catalogIndex, {
      elementId: 'walk-1',
      surfacePoint: at(5, 41.1),
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'point-off-element', elementId: 'walk-1' },
    });
  });

  it('keeps a point inside an area and refuses one in its notch', () => {
    const inside = resolveAnchor(document, catalogIndex, {
      elementId: 'garden-1',
      surfacePoint: at(35, 20),
    });
    expect(inside.ok && inside.value).toMatchObject({ elementKind: 'area', category: 'garden' });
    const notch = resolveAnchor(document, catalogIndex, {
      elementId: 'garden-1',
      surfacePoint: at(45, 20),
    });
    expect(notch.ok).toBe(false);
  });

  it('answers unknown-element for a deleted element and for a zone', () => {
    const gone = resolveAnchor(document, catalogIndex, { elementId: 'bench-9' });
    expect(gone).toEqual({ ok: false, error: { kind: 'unknown-element', elementId: 'bench-9' } });
    const zone = resolveAnchor(document, catalogIndex, { elementId: 'zone-1' });
    expect(zone.ok || zone.error.kind).toBe('unknown-element');
  });
});

describe('anchorPoint', () => {
  it('uses the item position', () => {
    const point = anchorPoint(document, { elementId: id('bench-1'), surfacePoint: undefined });
    expect(point).toEqual({ x: 10, y: 10 });
  });

  it('uses a stored surface point on a path or area', () => {
    const surfacePoint = at(35, 20);
    const point = anchorPoint(document, { elementId: id('garden-1'), surfacePoint });
    expect(point).toEqual(surfacePoint);
  });

  it('takes the path midpoint by length', () => {
    const point = anchorPoint(document, { elementId: id('walk-1'), surfacePoint: undefined });
    expect(point).toEqual({ x: 10, y: 45 });
  });

  it('keeps the area anchor inside a concave polygon', () => {
    const point = anchorPoint(document, { elementId: id('garden-1'), surfacePoint: undefined });
    expect(point).toBeDefined();
    expect(point && polygonContains(U_SHAPE, point)).toBe(true);
  });

  it('answers undefined for an element no longer in the document', () => {
    expect(anchorPoint(document, { elementId: id('bench-9'), surfacePoint: undefined })).toBe(
      undefined,
    );
  });
});

describe('elementLabel', () => {
  it('names an item by catalog name and compass zone', () => {
    const label = elementLabel(document, catalogIndex, {
      ref: { elementId: id('bench-1'), elementKind: 'item' },
      parcel,
    });
    expect(label).toEqual({ name: 'Bench', zone: 'south-west' });
    expect(label && formatElementLabel(label)).toBe('Bench, south-west');
  });

  it('names a path by its surface entry', () => {
    const label = elementLabel(document, catalogIndex, {
      ref: { elementId: id('walk-1'), elementKind: 'path' },
      parcel,
    });
    expect(label).toEqual({ name: 'Asphalt path', zone: 'west' });
  });

  it('answers undefined for a missing element or a kind that does not match', () => {
    const missing = { elementId: id('bench-9'), elementKind: 'item' } as const;
    expect(elementLabel(document, catalogIndex, { ref: missing, parcel })).toBeUndefined();
    const wrongKind = { elementId: id('bench-1'), elementKind: 'area' } as const;
    expect(elementLabel(document, catalogIndex, { ref: wrongKind, parcel })).toBeUndefined();
  });
});

describe('carriedComments', () => {
  const base = {
    id: 'comment-1',
    designId: 'design-1',
    elementId: 'bench-1',
    elementKind: 'item',
    category: 'seating',
    authorId: 'resident-a',
    kind: 'move',
    text: '',
    createdAt: '2026-10-03T12:00:00.000Z',
    status: 'open',
    hidden: false,
  };
  const parse = (patch: object) => elementCommentSchema.parse({ ...base, ...patch });

  it('keeps open, visible comments on elements the new version still has', () => {
    const comments = [
      parse({ id: 'kept' }),
      parse({ id: 'resolved', status: 'resolved' }),
      parse({ id: 'hidden', hidden: true }),
      parse({ id: 'gone', elementId: 'bench-9' }),
    ];
    expect(carriedComments(comments, document).map((comment) => comment.id)).toEqual(['kept']);
  });

  it('keeps the shape it was given, such as the API record with its author name', () => {
    const records = [
      { id: 'kept', elementId: 'bench-1', status: 'open', hidden: false, author: 'Gail' },
      { id: 'gone', elementId: 'bench-9', status: 'open', hidden: false, author: 'Gail' },
    ] as const;
    expect(carriedComments(records, document)).toEqual([records[0]]);
  });
});
