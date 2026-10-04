import { describe, expect, it } from 'vitest';

import type { AreaKind } from '../types.js';

import { areaTreatment, gateIndex } from './area-style.js';

describe('areaTreatment', () => {
  it('fills gardens with raised beds and fences them', () => {
    const garden = areaTreatment('garden');
    expect(garden.surface).toBe('soil');
    expect(garden.fence).toBe('fenced');
    expect(garden.modules?.aisleM).toBeGreaterThan(0);
  });

  it('leaves lawns open and empty', () => {
    expect(areaTreatment('lawn')).toEqual({ surface: 'terrainMeadow', fence: 'open' });
  });

  it('fences play and dog areas', () => {
    const kinds: AreaKind[] = ['playground', 'dog-park'];
    kinds.forEach((kind) => {
      expect(areaTreatment(kind).fence).toBe('fenced');
    });
  });
});

describe('gateIndex', () => {
  const panels = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 10, y: 0, z: 0 }, rotationY: 0 },
  ];

  it('opens the panel nearest to any path point', () => {
    const paths = [
      [{ x: 50, z: 50 }],
      [
        { x: 30, z: 0 },
        { x: 11, z: 1 },
      ],
    ];
    expect(gateIndex(panels, paths)).toBe(1);
  });

  it('has no gate when there are no paths', () => {
    expect(gateIndex(panels, [])).toBe(-1);
  });
});
