import { describe, expect, it } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import { buildContextMeshes } from './context-geometry.js';
import { anyLayerOn, contextDrawPlan, CONTEXT_DRAW_CALL_BUDGET } from './layer-plan.js';
import { sampleSiteContext } from './sample-context.js';

const heightmap = heightmapFrom({ width: 176, height: 86, resolutionM: 1 }, () => 18);
const meshes = buildContextMeshes(sampleSiteContext, heightmap);
const allOn = {
  street: 'on',
  sidewalk: 'on',
  busStop: 'on',
  parking: 'on',
  bikeway: 'on',
} as const;
const allOff = {
  street: 'off',
  sidewalk: 'off',
  busStop: 'off',
  parking: 'off',
  bikeway: 'off',
} as const;

describe('contextDrawPlan', () => {
  it('draws every layer in 6 draw calls: the apron and one merged mesh per kind', () => {
    const plan = contextDrawPlan(meshes, allOn);
    expect(plan).toEqual(['apron', 'street', 'sidewalk', 'parking', 'bikeway', 'busStop']);
    expect(plan.length).toBeLessThanOrEqual(CONTEXT_DRAW_CALL_BUDGET);
    expect(CONTEXT_DRAW_CALL_BUDGET).toBe(6);
  });

  it('draws the apron, streets, sidewalks and bus stops by default', () => {
    expect(contextDrawPlan(meshes, CONTEXT_LAYER_DEFAULTS)).toEqual([
      'apron',
      'street',
      'sidewalk',
      'busStop',
    ]);
  });

  it('draws nothing, not even the apron, with every layer off', () => {
    expect(contextDrawPlan(meshes, allOff)).toEqual([]);
    expect(anyLayerOn(allOff)).toBe(false);
  });

  it('leaves out a kind that is on but has nothing to draw', () => {
    const empty = buildContextMeshes({ ...sampleSiteContext, features: [] }, heightmap);
    expect(contextDrawPlan(empty, allOn)).toEqual(['apron']);
  });
});
