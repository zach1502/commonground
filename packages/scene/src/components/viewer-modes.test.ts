import { describe, expect, expectTypeOf, it } from 'vitest';

import { itemIdSchema, type ElementRef } from '@parkshape/core';

import { docOf } from '../editor/test-fixtures.js';

import type { ParkViewerProps } from './ParkViewer.js';
import type { ReviewLayerProps, WalkProps } from './viewer-modes.js';

describe('viewer mode props', () => {
  it('lets the review layer report the element a person picks', () => {
    const picked: (ElementRef | undefined)[] = [];
    const review: ReviewLayerProps = {
      design: docOf(),
      counts: new Map([['bench-1', 2]]),
      selected: undefined,
      onSelect: (ref) => picked.push(ref),
      chipLabel: (_id, count) => `${String(count)} comments`,
      frameRequest: 0,
    };
    review.onSelect({ elementId: itemIdSchema.parse('bench-1'), elementKind: 'item' });
    review.onSelect(undefined);
    expect(picked).toEqual([{ elementId: 'bench-1', elementKind: 'item' }, undefined]);
  });

  it('gives the viewer optional review and walk props', () => {
    expectTypeOf<ParkViewerProps['review']>().toEqualTypeOf<ReviewLayerProps | undefined>();
    expectTypeOf<ParkViewerProps['walk']>().toEqualTypeOf<WalkProps | undefined>();
  });
});
