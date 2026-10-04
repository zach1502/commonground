import { describe, expect, it } from 'vitest';

import type { SceneBounds } from '../geometry/sample.js';
import type { Vector3 } from '../types.js';

import {
  CATALOG_THUMBNAIL_SETTINGS,
  catalogThumbnailView,
  type CatalogThumbnailView,
} from './framing.js';

const box = (widthM: number, heightM: number, depthM: number): SceneBounds => ({
  minX: -widthM / 2,
  maxX: widthM / 2,
  minY: 0,
  maxY: heightM,
  minZ: -depthM / 2,
  maxZ: depthM / 2,
});

const BENCH = box(1.8, 0.9, 1);
const SHRUB = box(4, 2.5, 4);
const TREE = box(14, 25, 14);
const CYPRESS = box(3, 12, 3);
const BIN = box(0.5, 1, 0.55);
const LAWN = box(10, 0.05, 10);
const POND = box(12, 0.6, 9);
const COURT = box(15, 3.05, 14);
const MODELS = [BENCH, SHRUB, TREE, CYPRESS, BIN, LAWN, POND, COURT];

const DEG = 180 / Math.PI;
const minus = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const offsetOf = (view: CatalogThumbnailView) => minus(view.position, view.target);
const elevationOf = (offset: Vector3) => Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) * DEG;
const cornersOf = (model: SceneBounds): Vector3[] =>
  [model.minX, model.maxX].flatMap((x) =>
    [model.minY, model.maxY].flatMap((y) => [model.minZ, model.maxZ].map((z) => ({ x, y, z }))),
  );
const radiusOf = (model: SceneBounds) =>
  Math.hypot(model.maxX - model.minX, model.maxY - model.minY, model.maxZ - model.minZ) / 2;

/** Screen position as a share of the half frame: -1 and 1 are the frame edges. */
function screenOf(view: CatalogThumbnailView, point: Vector3) {
  const relative = minus(point, view.target);
  return {
    u: dot(relative, view.right) / view.halfSizeM,
    v: dot(relative, view.up) / view.halfSizeM,
  };
}

/** Where a corner's shadow lands on the ground plane under the view's sun. */
function shadowOf(view: CatalogThumbnailView, corner: Vector3, groundY: number): Vector3 {
  const toSun = minus(view.sun.position, view.sun.target);
  const along = (corner.y - groundY) / toSun.y;
  return { x: corner.x - toSun.x * along, y: groundY, z: corner.z - toSun.z * along };
}

const PADDED_EDGE = 1 - 2 * CATALOG_THUMBNAIL_SETTINGS.minPadding;

describe('catalogThumbnailView', () => {
  it('looks down 30 degrees from the front-left at a standing model', () => {
    const offset = offsetOf(catalogThumbnailView(BENCH));
    expect(elevationOf(offset)).toBeCloseTo(30, 5);
    expect(offset.x).toBeLessThan(0);
    expect(offset.z).toBeGreaterThan(0);
    expect(Math.abs(offset.x)).toBeCloseTo(offset.z, 5);
  });

  it('looks down 50 degrees at flat ground, from the same heading', () => {
    for (const model of [LAWN, POND]) {
      const offset = offsetOf(catalogThumbnailView(model));
      expect(elevationOf(offset)).toBeCloseTo(50, 5);
      expect(Math.abs(offset.x)).toBeCloseTo(offset.z, 5);
    }
  });

  it('keeps a court with a backboard at the standing angle', () => {
    expect(elevationOf(offsetOf(catalogThumbnailView(COURT)))).toBeCloseTo(30, 5);
  });
});

describe('catalogThumbnailView fill', () => {
  it('fits the bounding sphere to 80 percent of the frame when no shadow reaches past it', () => {
    for (const model of [LAWN, POND]) {
      const view = catalogThumbnailView(model);
      expect(view.fill).toBeCloseTo(CATALOG_THUMBNAIL_SETTINGS.sphereFill, 5);
      expect(view.halfSizeM).toBeCloseTo(radiusOf(model) / view.fill, 5);
    }
  });

  it('draws a bench and a tree at nearly the same fill, so every icon fills its cell', () => {
    const gap = catalogThumbnailView(BENCH).fill - catalogThumbnailView(TREE).fill;
    expect(Math.abs(gap)).toBeLessThan(0.1);
  });

  it('never lets the sphere fill less than 70 percent', () => {
    for (const model of MODELS) expect(catalogThumbnailView(model).fill).toBeGreaterThan(0.7);
  });

  it('keeps every box corner inside the frame, clear of the padding', () => {
    for (const model of MODELS) {
      const view = catalogThumbnailView(model);
      for (const corner of cornersOf(model)) {
        const { u, v } = screenOf(view, corner);
        expect(Math.abs(u)).toBeLessThanOrEqual(PADDED_EDGE + 1e-9);
        expect(Math.abs(v)).toBeLessThanOrEqual(PADDED_EDGE + 1e-9);
      }
    }
  });

  it('keeps every corner shadow inside the frame, clear of the padding', () => {
    for (const model of MODELS) {
      const view = catalogThumbnailView(model);
      for (const corner of cornersOf(model)) {
        const { u, v } = screenOf(view, shadowOf(view, corner, model.minY));
        expect(Math.abs(u)).toBeLessThanOrEqual(PADDED_EDGE + 1e-9);
        expect(Math.abs(v)).toBeLessThanOrEqual(PADDED_EDGE + 1e-9);
      }
    }
  });
});

describe('catalogThumbnailView light', () => {
  it('lights every picture with one sun, 60 degrees up and turned 110 degrees from the camera', () => {
    for (const model of [BENCH, LAWN, TREE]) {
      const view = catalogThumbnailView(model);
      const camera = Math.atan2(offsetOf(view).x, offsetOf(view).z);
      const toSun = minus(view.sun.position, view.sun.target);
      const turn = ((((Math.atan2(toSun.x, toSun.z) - camera) * DEG) % 360) + 360) % 360;
      expect(turn).toBeCloseTo(110, 3);
      expect(elevationOf(toSun)).toBeCloseTo(CATALOG_THUMBNAIL_SETTINGS.sunElevationDeg, 5);
    }
  });

  it('covers the model with the shadow camera', () => {
    for (const model of MODELS) {
      expect(catalogThumbnailView(model).shadowHalfSideM).toBeGreaterThanOrEqual(radiusOf(model));
    }
  });
});
