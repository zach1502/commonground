import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '@parkshape/core';

import type { ParkDocument } from '../types.js';

import {
  birdFlights,
  CLUTTER_KINDS,
  CLUTTER_HIDE_BEYOND_M,
  dressingLayout,
  FIGURE_PARTS,
  figureHeightM,
} from './dressing.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const ground = heightmapFrom({ width: 120, height: 80, resolutionM: 1 }, (x) => 10 + x * 0.02);
const park: ParkDocument = {
  items: Array.from({ length: 12 }, (_, index) => ({
    id: `tree-${String(index)}`,
    catalogId: 'maple',
    position: { x: 10 + index * 8, z: 20 },
    rotationY: 0,
    scale: 1,
  })),
  paths: [
    {
      id: 'loop',
      widthM: 2,
      points: [
        { x: 10, z: 40 },
        { x: 100, z: 40 },
        { x: 100, z: 70 },
      ],
    },
  ],
  areas: [],
  water: [],
};
const layout = dressingLayout({
  heightmap: ground,
  document: park,
  trees: park.items.map((item) => item.position),
  random: createSeededRandom(3),
});

describe('dressing figures', () => {
  it('stands people at 1.6 to 1.8 m', () => {
    expect(figureHeightM(FIGURE_PARTS)).toBeGreaterThanOrEqual(1.6);
    expect(figureHeightM(FIGURE_PARTS)).toBeLessThanOrEqual(1.8);
  });

  it('places 8 to 12 figures on the ground', () => {
    expect(layout.figures.length).toBeGreaterThanOrEqual(8);
    expect(layout.figures.length).toBeLessThanOrEqual(12);
    layout.figures.forEach((figure) => {
      expect(figure.position.y).toBeCloseTo(10 + figure.position.x * 0.02, 1);
      expect(figure.scale).toBe(1);
    });
  });
});

describe('dressing clutter', () => {
  it('scatters 60 to 120 instances in at most 3 kinds, so it adds at most 3 draw calls', () => {
    const total = layout.clutter.reduce((sum, kind) => sum + kind.transforms.length, 0);
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(120);
    expect(layout.clutter.length).toBeLessThanOrEqual(3);
    expect(CLUTTER_KINDS.length).toBeLessThanOrEqual(3);
    expect(CLUTTER_HIDE_BEYOND_M).toBe(250);
  });

  it('is the same on every render of a design', () => {
    const again = dressingLayout({
      heightmap: ground,
      document: park,
      trees: park.items.map((item) => item.position),
      random: createSeededRandom(3),
    });
    expect(again).toEqual(layout);
  });
});

describe('birdFlights', () => {
  it('flies 6 to 10 birds 20 to 30 m up', () => {
    const flights = birdFlights({ random: createSeededRandom(5), motion: 'full' });
    expect(flights.length).toBeGreaterThanOrEqual(6);
    expect(flights.length).toBeLessThanOrEqual(10);
    flights.forEach((flight) => {
      expect(flight.heightM).toBeGreaterThanOrEqual(20);
      expect(flight.heightM).toBeLessThanOrEqual(30);
    });
  });

  it('has no birds with reduced motion', () => {
    expect(birdFlights({ random: createSeededRandom(5), motion: 'reduced' })).toEqual([]);
  });
});
