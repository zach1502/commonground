import { describe, expect, it } from 'vitest';

import { EDITOR_COLUMNS, editorColumns, editorColumnWidths } from './layout.js';

describe('the editor columns', () => {
  it('keeps the full-page editor at 18 rem tools and 20 rem details', () => {
    const widths = editorColumnWidths(1440);
    expect(widths.tools).toBe(288);
    expect(widths.details).toBe(320);
    expect(widths.canvas).toBe(832);
  });

  it('gives the canvas more than half of a 1100 px wizard column', () => {
    const widths = editorColumnWidths(1100);
    expect(widths.canvas).toBeGreaterThan(550);
    expect(widths.tools + widths.details + widths.canvas).toBe(1100);
  });

  it('never squeezes the side columns under their smallest readable width', () => {
    const widths = editorColumnWidths(800);
    expect(widths.tools).toBe(208);
    expect(widths.details).toBe(240);
  });

  it('sizes the side columns from the container, with no fixed pixel width', () => {
    expect(EDITOR_COLUMNS).toBe(
      'clamp(13rem, 20%, 18rem) minmax(0, 1fr) clamp(15rem, 22.5%, 20rem)',
    );
    expect(EDITOR_COLUMNS).not.toMatch(/px/);
  });

  it('widens the details column to 28 rem while the Items list is open', () => {
    const widths = editorColumnWidths(1440, { details: 'list' });
    expect(widths.details).toBe(448);
    expect(widths.canvas).toBe(704);
    expect(editorColumns('list')).toBe(
      'clamp(13rem, 20%, 18rem) minmax(0, 1fr) clamp(15rem, 32%, 28rem)',
    );
    expect(editorColumns('standard')).toBe(EDITOR_COLUMNS);
  });
});
