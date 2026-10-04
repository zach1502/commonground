import { describe, expect, it } from 'vitest';

import { designDocumentSchema, parcelSchema } from '@parkshape/core';

import { TEST_NOW } from '../../test/api-server';
import { commentOf, REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

import {
  categoryCounts,
  commentCounts,
  elementEntries,
  entriesIn,
  itemLabels,
  relativeTime,
} from './review-model';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const ago = (ms: number) => new Date(TEST_NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it.each([
    [0, 'now'],
    [12 * SECOND_MS, '12 seconds ago'],
    [MINUTE_MS, '1 minute ago'],
    [3 * HOUR_MS, '3 hours ago'],
    [2 * DAY_MS, '2 days ago'],
  ])('reads %i ms back as %s', (ms, text) => {
    expect(relativeTime(ago(ms), TEST_NOW)).toBe(text);
  });
});

describe('elementEntries', () => {
  it('names every item, path and area by catalog name and zone, kinds in that order', () => {
    const document = designDocumentSchema.parse(REVIEW_DESIGN.document);
    const parcel = parcelSchema.parse(REVIEW_PROJECT.parcel);
    const entries = elementEntries(document, parcel);
    expect(entries.map((entry) => [entry.ref.elementId, entry.ref.elementKind])).toEqual([
      ['bench-1', 'item'],
      ['maple-1', 'item'],
      ['path-1', 'path'],
      ['lawn-1', 'area'],
    ]);
    expect(entries[0]?.name).toBe('Bench');
    expect(entries[0]?.label).toMatch(/^Bench, [a-z-]+$/);
  });
});

describe('commentCounts', () => {
  it('counts open comments per element and leaves resolved ones out', () => {
    const counts = commentCounts([
      commentOf(),
      commentOf({ id: 'c2' }),
      commentOf({ id: 'c3', status: 'resolved' }),
      commentOf({ id: 'c4', elementId: 'lawn-1' }),
    ]);
    expect([...counts.entries()]).toEqual([
      ['bench-1', 2],
      ['lawn-1', 1],
    ]);
  });
});

describe('itemLabels', () => {
  it('names each item with its zone for the walk, and leaves paths and areas out', () => {
    const labels = itemLabels(REVIEW_DESIGN, REVIEW_PROJECT);
    expect([...labels.keys()]).toEqual(['bench-1', 'maple-1']);
    expect(labels.get('bench-1')).toMatch(/^Bench, [a-z-]+$/);
  });
});

describe('category filter', () => {
  const entries = () =>
    elementEntries(
      designDocumentSchema.parse(REVIEW_DESIGN.document),
      parcelSchema.parse(REVIEW_PROJECT.parcel),
    );

  it('gives each element its catalog category', () => {
    expect(entries().map((entry) => entry.category)).toEqual(['seating', 'tree', 'path', 'ground']);
  });

  it('lists the categories the design has, in catalog order, with their element counts', () => {
    expect(categoryCounts(entries())).toEqual([
      { category: 'tree', count: 1 },
      { category: 'path', count: 1 },
      { category: 'seating', count: 1 },
      { category: 'ground', count: 1 },
    ]);
  });

  it('keeps every element for all and only that category otherwise', () => {
    expect(entriesIn(entries(), 'all')).toHaveLength(4);
    expect(entriesIn(entries(), 'tree').map((entry) => entry.ref.elementId)).toEqual(['maple-1']);
  });
});
