import { describe, expect, it } from 'vitest';

import { contextFeatureSchema, siteContextSchema, type SiteContext } from '@parkshape/core';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';
import type { MeshArrays } from '../types.js';

import { buildContextMeshes } from './context-geometry.js';

// The box runs over node centres from (0, 0) to (175, 85).
const box = heightmapFrom({ width: 176, height: 86, resolutionM: 1 }, () => 15);
const triangleOutline = [
  { x: 0, y: 0 },
  { x: 175, y: 0 },
  { x: 0, y: 85 },
];
const islanded = { ...box, groundOutline: triangleOutline };
const source = { name: 'Vancouver Open Data', datasetId: 'public-streets' };

function only(features: unknown[]): SiteContext {
  return siteContextSchema.parse({
    features: features.map((raw) => contextFeatureSchema.parse(raw)),
    bufferM: 300,
    recordedAt: '2026-10-02T00:00:00.000Z',
  });
}

const line = (id: string, kind: string, points: { x: number; y: number }[], widthM: number) => ({
  id,
  kind,
  source,
  name: 'W 7th Ave',
  geometry: { type: 'line', points, widthM },
});

const stop = (id: string, x: number, y: number) => ({
  id,
  kind: 'busStop',
  source,
  name: id,
  geometry: { type: 'point', position: { x, y } },
});

function xsOf(mesh: MeshArrays): number[] {
  return [...mesh.positions].filter((_, index) => index % 3 === 0);
}

function groundsOf(mesh: MeshArrays) {
  return Array.from({ length: mesh.positions.length / 3 }, (_, vertex) => ({
    x: mesh.positions[vertex * 3] ?? 0,
    z: mesh.positions[vertex * 3 + 2] ?? 0,
  }));
}

describe('buildContextMeshes keeps the park ground clear', () => {
  it('stops a sidewalk that overlaps the box edge at the edge', () => {
    const sidewalk = line(
      'sidewalk-1',
      'sidewalk',
      [
        { x: -0.5, y: 10 },
        { x: -0.5, y: 70 },
      ],
      2,
    );
    const mesh = buildContextMeshes(only([sidewalk]), box).lines.sidewalk;
    expect(Math.max(...xsOf(mesh))).toBeCloseTo(0, 6);
    expect(Math.min(...xsOf(mesh))).toBeCloseTo(-1.5, 6);
  });

  it('cuts a street across a triangular parcel to the outside of the outline', () => {
    const street = line(
      'street-1',
      'street',
      [
        { x: -60, y: 40 },
        { x: 240, y: 40 },
      ],
      12,
    );
    const mesh = buildContextMeshes(only([street]), islanded).lines.street;
    // Strictly inside means past both legs and short of the long side, beyond float rounding.
    const inside = groundsOf(mesh).filter(
      (point) => point.x > 1e-4 && point.z > 1e-4 && point.x / 175 + point.z / 85 < 1 - 1e-4,
    );
    expect(inside).toEqual([]);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('cuts parking stalls the same way', () => {
    const stall = {
      id: 'parking-1',
      kind: 'parking',
      source: { ...source, datasetId: 'parking-meters' },
      geometry: {
        type: 'polygon',
        ring: [
          { x: -3, y: 20 },
          { x: 3, y: 20 },
          { x: 3, y: 22.4 },
          { x: -3, y: 22.4 },
        ],
      },
    };
    const mesh = buildContextMeshes(only([stall]), box).parking;
    expect(Math.max(...xsOf(mesh))).toBeCloseTo(0, 6);
  });
});

describe('buildContextMeshes keeps pins and names off the park', () => {
  it('drops a bus stop inside the park and keeps one outside', () => {
    const { busStops } = buildContextMeshes(
      only([stop('inside', 20, 20), stop('outside', -4, 20), stop('corner', 150, 70)]),
      islanded,
    );
    expect(busStops.map((pin) => pin.id)).toEqual(['outside', 'corner']);
  });

  it('moves a street name off the park to the nearest outside part of the street', () => {
    const street = line(
      'street-1',
      'street',
      [
        { x: -60, y: 40 },
        { x: 150, y: 40 },
      ],
      12,
    );
    const [label] = buildContextMeshes(only([street]), box).labels;
    expect(label?.position.x).toBeCloseTo(0, 6);
    expect(label?.position.z).toBeCloseTo(40, 6);
  });

  it('names no street that lies wholly in the park', () => {
    const street = line(
      'street-1',
      'street',
      [
        { x: 10, y: 40 },
        { x: 100, y: 40 },
      ],
      12,
    );
    expect(buildContextMeshes(only([street]), box).labels).toEqual([]);
  });
});
