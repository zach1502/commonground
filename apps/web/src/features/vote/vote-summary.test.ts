import { describe, expect, it } from 'vitest';

import type { Design } from '../../api/web-api';

import { voteViewSummary } from './vote-summary';

function designWith(document: unknown, totals: { costCad: number } | null): Design {
  return { document, metrics: totals === null ? null : { totals } } as unknown as Design;
}

const EMPTY_DOC = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

describe('voteViewSummary', () => {
  it('names the items by kind and count, then the cost', () => {
    const doc = {
      ...EMPTY_DOC,
      items: [
        {
          id: 'a',
          catalogId: 'western-red-cedar',
          position: { x: 1, y: 1 },
          rotationDeg: 0,
          locked: false,
        },
        {
          id: 'b',
          catalogId: 'western-red-cedar',
          position: { x: 2, y: 2 },
          rotationDeg: 0,
          locked: false,
        },
        { id: 'c', catalogId: 'bench', position: { x: 3, y: 3 }, rotationDeg: 0, locked: false },
      ],
    };
    const summary = voteViewSummary(designWith(doc, { costCad: 310000 }));
    expect(summary).toContain('2 trees');
    expect(summary).toContain('1 seat');
    expect(summary).toContain('The design costs $310,000.');
  });

  it('reads a plain note for an empty design with no metrics', () => {
    expect(voteViewSummary(designWith(EMPTY_DOC, null))).not.toBe('');
  });
});
