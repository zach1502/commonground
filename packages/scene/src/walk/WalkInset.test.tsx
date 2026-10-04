// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';
import type { ParkDocument } from '../types.js';

import { WalkEngine } from './walk-engine.js';
import { WalkInset } from './WalkInset.js';

const parcel = [
  { x: 0, z: 0 },
  { x: 60, z: 0 },
  { x: 60, z: 40 },
  { x: 0, z: 40 },
];
const world = {
  heightmap: heightmapFrom({ width: 61, height: 41, resolutionM: 1 }, () => 0),
  parcel,
};
const document: ParkDocument = {
  items: [],
  paths: [
    {
      id: 'p',
      widthM: 2,
      points: [
        { x: 1, z: 20 },
        { x: 59, z: 20 },
      ],
    },
  ],
  areas: [],
  water: [],
};
const starts = [
  { position: { x: 10, z: 5 }, headingRad: 0, kind: 'edge' as const },
  { position: { x: 50, z: 35 }, headingRad: Math.PI / 2, kind: 'edge' as const },
];

afterEach(cleanup);

describe('WalkInset', () => {
  it('draws the parcel and the paths, hidden from screen readers', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    const { container } = render(<WalkInset engine={engine} parcel={parcel} document={document} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-inset="parcel"]')?.getAttribute('points')).toBe(
      '0,0 60,0 60,-40 0,-40',
    );
    expect(container.querySelectorAll('[data-inset="path"]')).toHaveLength(1);
  });

  it('puts the dot where the walker stands, north up, and turns the wedge with the heading', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    const { container } = render(<WalkInset engine={engine} parcel={parcel} document={document} />);
    const marker = () => container.querySelector('[data-inset="you"]')?.getAttribute('transform');
    expect(marker()).toBe('translate(10 -5) rotate(0)');
    act(() => {
      engine.next();
    });
    expect(marker()).toBe('translate(50 -35) rotate(90)');
  });
});
