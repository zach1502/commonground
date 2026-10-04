import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORE_PRIOR, GRID_RESOLUTION_M, QUEUE_BATCH_SIZE, clamp } from './index.js';

const LOWER = 0;
const UPPER = 10;
const ABOVE_UPPER = 42;

describe('clamp', () => {
  it('keeps values inside the range and pins values outside it', () => {
    expect(clamp(UPPER / 2, LOWER, UPPER)).toBe(UPPER / 2);
    expect(clamp(ABOVE_UPPER, LOWER, UPPER)).toBe(UPPER);
    expect(clamp(-ABOVE_UPPER, LOWER, UPPER)).toBe(LOWER);
  });

  it('rejects an inverted range', () => {
    expect(() => clamp(1, UPPER, LOWER)).toThrow(RangeError);
  });
});

describe('constants', () => {
  it('exposes the documented defaults', () => {
    expect(GRID_RESOLUTION_M).toBe(1);
    expect(QUEUE_BATCH_SIZE).toBe(5);
    expect(DEFAULT_SCORE_PRIOR).toEqual({ up: 2, down: 2 });
  });
});

describe('domain barrel', () => {
  it('exports the schemas, catalog and validators', async () => {
    const core = await import('./index.js');
    expect(core.designDocumentSchema).toBeDefined();
    expect(core.projectParametersSchema).toBeDefined();
    expect(core.parcelSchema).toBeDefined();
    expect(core.catalogItemSchema).toBeDefined();
    expect(core.catalogItems.length).toBeGreaterThan(0);
    expect(core.moduleKitItems.length).toBe(5);
    expect(typeof core.validateDesignAgainstCatalog).toBe('function');
    expect(typeof core.defaultParameters).toBe('function');
    expect(typeof core.computeMetrics).toBe('function');
    expect(typeof core.plotsRecordedInside).toBe('function');
    expect(typeof core.isSubmittable).toBe('function');
    expect(typeof core.makeRampHeightmap).toBe('function');
  });

  it('exports the footprint and raster helpers the editor checks placements with', async () => {
    const core = await import('./index.js');
    expect(typeof core.designFootprints).toBe('function');
    expect(typeof core.rasterizeOrientedRect).toBe('function');
    expect(typeof core.rasterizePolygon).toBe('function');
    expect(typeof core.intersectCount).toBe('function');
    expect(typeof core.gridOf).toBe('function');
  });

  it('exports the scoring and queue functions', async () => {
    const core = await import('./index.js');
    expect(typeof core.score).toBe('function');
    expect(typeof core.rankDesigns).toBe('function');
    expect(typeof core.pickQueue).toBe('function');
  });

  it('exports the en-CA percent and dollar formats', async () => {
    const core = await import('./index.js');
    expect(core.formatPercent(0.35)).toBe('35%');
    expect(core.formatCad(121220)).toBe('$121,220');
  });

  it('exports the parcel grid used for flat terrain', async () => {
    const core = await import('./index.js');
    expect(typeof core.parcelGrid).toBe('function');
  });

  it('exports the terraform metrics and brush helpers the editor reuses', async () => {
    const core = await import('./index.js');
    expect(typeof core.measureTerraform).toBe('function');
    expect(typeof core.lockedTrees).toBe('function');
    expect(typeof core.rasterizeCircle).toBe('function');
    expect(typeof core.maskIndexes).toBe('function');
    expect(typeof core.cellCentre).toBe('function');
    expect(typeof core.emptyMask).toBe('function');
    expect(typeof core.countCells).toBe('function');
    expect(core.formatCubicMetres(30)).toBe('30 m³');
    expect(core.formatMetres(5)).toBe('5 m');
    expect(core.plural(1, 'truck load')).toBe('1 truck load');
    expect(core.plural(3, 'truck load')).toBe('3 truck loads');
  });
});

describe('review and context barrel', () => {
  it('exports the site context and element comment domain', async () => {
    const core = await import('./index.js');
    expect(core.contextFeatureSchema).toBeDefined();
    expect(core.siteContextSchema).toBeDefined();
    expect(core.CONTEXT_LAYER_DEFAULTS.street).toBe('on');
    expect(core.elementCommentSchema).toBeDefined();
    expect(core.ELEMENT_COMMENT_MAX_CHARS).toBe(280);
    expect(typeof core.resolveAnchor).toBe('function');
    expect(typeof core.anchorPoint).toBe('function');
    expect(typeof core.plainTextSchema).toBe('function');
  });
});
