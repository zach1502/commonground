import { getBounds } from '@gltf-transform/functions';
import { describe, expect, it } from 'vitest';

import { documentFromParts, placeholderDocument, placeholderParts } from './procedural.js';
import { assetTargets, type AssetTarget } from './targets.js';

const PLAY_KEYS = ['playground-structure', 'swings', 'spray-pad', 'outdoor-fitness-station'];

function targetFor(modelKey: string): AssetTarget {
  const target = assetTargets().find((entry) => entry.modelKey === modelKey);
  if (target === undefined) throw new Error(`no target ${modelKey}`);
  return target;
}

function sceneBounds(target: AssetTarget): { min: number[]; max: number[] } {
  const scene = placeholderDocument(target).getRoot().getDefaultScene();
  if (scene === null) throw new Error('no scene');
  return getBounds(scene);
}

describe('documentFromParts', () => {
  it('puts each part in its own node with one material per colour', () => {
    const document = documentFromParts('pair', [
      { shape: 'box', widthM: 1, depthM: 1, heightM: 1, x: 0, baseY: 0, z: 0, colour: 'wood' },
      { shape: 'sphere', widthM: 1, depthM: 1, heightM: 1, x: 2, baseY: 1, z: 0, colour: 'wood' },
    ]);
    const root = document.getRoot();
    expect(root.listNodes()).toHaveLength(2);
    expect(root.listMaterials()).toHaveLength(1);
    const scene = root.getDefaultScene();
    expect(scene === null ? undefined : getBounds(scene).max).toEqual([2.5, 2, 0.5]);
  });
});

describe('placeholderParts', () => {
  it('gives every target at least one part', () => {
    assetTargets().forEach((target) => {
      expect(placeholderParts(target).length).toBeGreaterThan(0);
    });
  });

  it('builds a tree with a trunk and a crown as tall as the catalog height', () => {
    const tree = targetFor('tree-garry-oak');
    expect(placeholderParts(tree).map((part) => part.shape)).toEqual(['cylinder', 'sphere']);
    expect(sceneBounds(tree).max[1]).toBeCloseTo(tree.dims.heightM);
  });

  it('builds sports and play frames inside the catalog footprint', () => {
    ['tennis-court', 'swings', 'drinking-fountain', 'picnic-table', 'lawn'].forEach((modelKey) => {
      const target = targetFor(modelKey);
      const { min, max } = sceneBounds(target);
      expect((max[0] ?? 0) - (min[0] ?? 0)).toBeLessThanOrEqual(target.dims.widthM + 1e-6);
      expect(max[1]).toBeCloseTo(target.dims.heightM);
      expect((max[2] ?? 0) - (min[2] ?? 0)).toBeLessThanOrEqual(target.dims.depthM + 1e-6);
    });
  });
});

describe('play and court composites', () => {
  it('hangs at least 3 seats from the swing frame', () => {
    const parts = placeholderParts(targetFor('swings'));
    expect(parts.filter((entry) => entry.colour === 'seat')).toHaveLength(3);
  });

  it('gives the play structure a deck, a roof and a stepped slide down to the ground', () => {
    const parts = placeholderParts(targetFor('playground-structure'));
    const slide = parts.filter((entry) => entry.colour === 'slide');
    expect(slide.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...slide.map((entry) => entry.baseY))).toBeLessThan(0.3);
    expect(parts.some((entry) => entry.colour === 'roof')).toBe(true);
  });

  it('puts a net across the tennis court and a hoop on the half court', () => {
    expect(
      placeholderParts(targetFor('tennis-court')).some((entry) => entry.colour === 'net'),
    ).toBe(true);
    expect(
      placeholderParts(targetFor('basketball-half-court')).some((entry) => entry.colour === 'hoop'),
    ).toBe(true);
  });

  it('lays each play model on a surface that fills its catalog footprint', () => {
    PLAY_KEYS.forEach((modelKey) => {
      const target = targetFor(modelKey);
      const { min, max } = sceneBounds(target);
      expect((max[0] ?? 0) - (min[0] ?? 0)).toBeCloseTo(target.dims.widthM);
      expect((max[2] ?? 0) - (min[2] ?? 0)).toBeCloseTo(target.dims.depthM);
      expect(max[1] ?? 0).toBeLessThanOrEqual(target.dims.heightM + 1e-6);
    });
  });

  it('gives the spray pad a concrete pad with spray posts on it', () => {
    const parts = placeholderParts(targetFor('spray-pad'));
    expect(parts.filter((entry) => entry.colour === 'concrete')).toHaveLength(1);
    expect(parts.filter((entry) => entry.colour === 'play').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the new frames inside the catalog box', () => {
    ['swings', 'playground-structure', 'basketball-half-court'].forEach((modelKey) => {
      const target = targetFor(modelKey);
      const { min, max } = sceneBounds(target);
      expect((max[0] ?? 0) - (min[0] ?? 0)).toBeLessThanOrEqual(target.dims.widthM + 1e-6);
      expect(max[1] ?? 0).toBeLessThanOrEqual(target.dims.heightM + 1e-6);
      expect((max[2] ?? 0) - (min[2] ?? 0)).toBeLessThanOrEqual(target.dims.depthM + 1e-6);
    });
  });
});
