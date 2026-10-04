import { describe, expect, it } from 'vitest';

import {
  catalogItems,
  designDocumentSchema,
  parcelSchema,
  type DesignDocument,
  type Parcel,
} from '@parkshape/core';

import { PALETTE_FALLBACKS } from '../palette/colours.js';

import {
  PLAN_POSTER_HEIGHT,
  PLAN_POSTER_WIDTH,
  planPosterSvg,
  planPosterUrl,
} from './plan-poster.js';

function firstOf(category: string) {
  const item = catalogItems.find((entry) => entry.category === category);
  if (item === undefined) throw new Error(`no ${category} in the catalog`);
  return item.id;
}

const parcel: Parcel = parcelSchema.parse({
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ],
  origin: { lat: 49.26, lon: -123.1 },
});

const document: DesignDocument = designDocumentSchema.parse({
  version: 1,
  items: [
    {
      id: 'i1',
      catalogId: firstOf('tree'),
      position: { x: 10, y: 40 },
      rotationDeg: 0,
      locked: false,
    },
    {
      id: 'i2',
      catalogId: firstOf('seating'),
      position: { x: 20, y: 5 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 25 },
        { x: 100, y: 25 },
      ],
    },
  ],
  areas: [
    {
      id: 'a1',
      catalogId: firstOf('water'),
      polygon: [
        { x: 60, y: 10 },
        { x: 80, y: 10 },
        { x: 70, y: 20 },
      ],
      locked: false,
    },
  ],
  gradeDelta: { cells: [] },
  zones: [],
});

const input = { document, parcel, palette: PALETTE_FALLBACKS };

describe('planPosterSvg', () => {
  it('draws at a fixed size with the parcel framed in the view box', () => {
    const svg = planPosterSvg(input);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`width="${String(PLAN_POSTER_WIDTH)}"`);
    expect(svg).toContain(`height="${String(PLAN_POSTER_HEIGHT)}"`);
    expect(svg).toMatch(/viewBox="-\d+(\.\d+)? -\d+(\.\d+)? 1\d\d(\.\d+)? \d+(\.\d+)?"/);
  });

  it('draws the parcel, each area, each path and each item once', () => {
    const svg = planPosterSvg(input);
    expect(svg.match(/<polygon /g)).toHaveLength(2);
    expect(svg.match(/<polyline /g)).toHaveLength(1);
    expect(svg.match(/<circle /g)).toHaveLength(2);
  });

  it('turns north up, so a point at the top of the parcel sits at the top of the picture', () => {
    const svg = planPosterSvg(input);
    expect(svg).toContain('points="0,0 100,0 100,-50 0,-50"');
    expect(svg).toMatch(/<circle cx="10" cy="-40"/);
  });
});

describe('planPosterSvg colours', () => {
  it('colours water, paths and trees from the scene palette', () => {
    const svg = planPosterSvg(input);
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.terrainGrass}"`);
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.water}"`);
    expect(svg).toContain(`stroke="${PALETTE_FALLBACKS.pathSurface}" stroke-width="2"`);
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.success}"`);
  });

  it('colours garden beds as soil, paving as path and lawn as meadow', () => {
    const triangle = document.areas[0]?.polygon ?? parcel.polygon;
    const area = (id: string, catalogId: string) => ({
      id,
      catalogId,
      polygon: triangle,
      locked: false,
    });
    const shrub = {
      id: 's1',
      catalogId: 'salal',
      position: { x: 1, y: 1 },
      rotationDeg: 0,
      locked: false,
    };
    const svg = planPosterSvg({
      ...input,
      document: {
        ...document,
        areas: [area('a1', 'community-garden'), area('a2', 'plaza'), area('a3', 'lawn')],
        items: [shrub],
      } as unknown as DesignDocument,
    });
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.soil}"`);
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.pathSurface}"`);
    expect(svg).toContain(`fill="${PALETTE_FALLBACKS.terrainMeadow}"`);
    expect(svg).toContain(`r="3" fill="${PALETTE_FALLBACKS.success}"`);
  });

  it('draws only the parcel for an empty design', () => {
    const empty = { ...document, items: [], paths: [], areas: [] };
    const svg = planPosterSvg({ ...input, document: empty });
    expect(svg.match(/<polygon /g)).toHaveLength(1);
    expect(svg).not.toContain('<circle');
  });
});

// The seeded Jonathan Rogers parcel, from packages/terrain/fixtures/jonathan-rogers/features.json.
const seededParcel: Parcel = parcelSchema.parse({
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0.2804529449417464, y: 85.48059347584964 },
    { x: 175.20861999327903, y: 80.53539075748942 },
    { x: 173.02712226473213, y: 0 },
    { x: 0, y: 4.74887392353963 },
  ],
  origin: { lat: 49.2638975433111, lon: -123.1093094963582 },
});

function viewBoxOf(svg: string): number[] {
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (match?.[1] === undefined) throw new Error('no viewBox');
  return match[1].split(' ').map(Number);
}

describe('planPosterSvg on the seeded parcel', () => {
  const svg = planPosterSvg({ ...input, parcel: seededParcel });
  const [left, top, width, height] = viewBoxOf(svg);

  it('frames the 176 by 86 m park at its real shape, about twice as wide as tall', () => {
    expect((width ?? 0) / (height ?? 1)).toBeCloseTo(2, 0);
    expect((width ?? 0) / (height ?? 1)).toBeGreaterThan(1.9);
  });

  it('leaves a 4 m margin on every side of the parcel', () => {
    expect(left).toBeCloseTo(-4, 2);
    expect(top).toBeCloseTo(-85.48 - 4, 2);
    expect(width).toBeCloseTo(175.21 + 8, 2);
    expect(height).toBeCloseTo(85.48 + 8, 2);
  });

  it('draws the real four-corner outline, not a box', () => {
    expect(svg).toContain('points="0.28,-85.48 175.21,-80.54 173.03,0 0,-4.75"');
  });
});

describe('planPosterUrl', () => {
  it('wraps the picture in a data URL an image tag can load', () => {
    const url = planPosterUrl(input);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',').slice(1).join(','))).toBe(planPosterSvg(input));
  });
});

describe('planPosterSvg on a triangular parcel', () => {
  const triangle = parcelSchema.parse({
    ...parcel,
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 50 },
    ],
  });
  const svg = planPosterSvg({ ...input, parcel: triangle });

  it('draws the ground as the triangle', () => {
    expect(svg).toContain('<polygon id="parcel" points="0,0 100,0 0,-50"');
  });

  it('masks the design to the triangle, so nothing shows past its long side', () => {
    expect(svg).toContain('<clipPath id="parcel-clip"><use href="#parcel"/></clipPath>');
    const clipped = svg.slice(svg.indexOf('<g clip-path="url(#parcel-clip)">'));
    // The path runs the full 100 m across, past the long side; it sits inside the masked group.
    expect(clipped).toContain('<polyline ');
    expect(clipped.match(/<circle /g)).toHaveLength(2);
    expect(clipped.match(/<polygon /g)).toHaveLength(1);
  });
});

describe('planPosterSvg on a rectangular parcel', () => {
  it('draws the design unmasked, as it always has', () => {
    expect(planPosterSvg(input)).not.toContain('clip-path');
  });
});
