import { describe, expect, it } from 'vitest';

import { contextFeatureSchema, siteContextSchema, type SiteContext } from '@parkshape/core';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import { apronElevation } from './apron.js';
import {
  BIKEWAY_DASH_M,
  buildContextMeshes,
  CONTEXT_LIFT_M,
  MAX_STREET_LABELS,
} from './context-geometry.js';
import { sampleSiteContext } from './sample-context.js';

const heightmap = heightmapFrom(
  { width: 176, height: 86, resolutionM: 1 },
  (_x, z) => 15 + 0.06 * z,
);
const ground = apronElevation(heightmap);
const source = { name: 'Vancouver Open Data', datasetId: 'public-streets' };
const vertexCount = (mesh: { readonly positions: Float32Array }) => mesh.positions.length / 3;

/** Parses plain numbers into a feature, as the API client does, so the metres are branded. */
const feature = (raw: unknown) => contextFeatureSchema.parse(raw);

function only(features: unknown[]): SiteContext {
  return siteContextSchema.parse({
    features,
    bufferM: 300,
    recordedAt: '2026-10-02T00:00:00.000Z',
  });
}

describe('buildContextMeshes', () => {
  it('merges each kind into one mesh, so the whole layer is a few draw calls', () => {
    const meshes = buildContextMeshes(sampleSiteContext, heightmap);
    expect(Object.keys(meshes.lines).sort()).toEqual(['bikeway', 'sidewalk', 'street']);
    expect(vertexCount(meshes.lines.street)).toBeGreaterThan(0);
    expect(vertexCount(meshes.lines.sidewalk)).toBeGreaterThan(0);
    expect(vertexCount(meshes.lines.bikeway)).toBeGreaterThan(0);
    expect(vertexCount(meshes.parking)).toBeGreaterThan(0);
    expect(meshes.busStops.length).toBeGreaterThan(0);
  });

  it('keeps the fixture-sized layer under 7k vertices, so with the apron it stays under 20k', () => {
    const meshes = buildContextMeshes(sampleSiteContext, heightmap);
    const total =
      vertexCount(meshes.lines.street) +
      vertexCount(meshes.lines.sidewalk) +
      vertexCount(meshes.lines.bikeway) +
      vertexCount(meshes.parking);
    expect(total).toBeLessThan(7000);
  });
});

describe('buildContextMeshes per kind', () => {
  it('lays a street flat on the ground at its lift, with the width from the data', () => {
    const street = feature({
      id: 'street-1',
      kind: 'street',
      source,
      geometry: {
        type: 'line',
        points: [
          { x: -200, y: -150 },
          { x: 200, y: -150 },
        ],
        widthM: 10,
      },
    });
    const mesh = buildContextMeshes(only([street]), heightmap).lines.street;
    const ys = mesh.positions.filter((_, index) => index % 3 === 1);
    const zs = mesh.positions.filter((_, index) => index % 3 === 2);
    ys.forEach((y) => {
      expect(y).toBeCloseTo(ground({ x: 0, z: -150 }) + CONTEXT_LIFT_M.street, 4);
    });
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(10, 4);
  });

  it('samples a line inside the blend band finely, so the ribbon follows the eased ground', () => {
    const sidewalk = feature({
      id: 'sidewalk-1',
      kind: 'sidewalk',
      source,
      geometry: {
        type: 'line',
        points: [
          { x: -1.5, y: -100 },
          { x: -1.5, y: 186 },
        ],
        widthM: 1.8,
      },
    });
    const mesh = buildContextMeshes(only([sidewalk]), heightmap).lines.sidewalk;
    for (let vertex = 0; vertex < vertexCount(mesh); vertex += 1) {
      const [x = 0, y = 0, z = 0] = mesh.positions.slice(vertex * 3, vertex * 3 + 3);
      expect(y).toBeCloseTo(ground({ x, z }) + CONTEXT_LIFT_M.sidewalk, 1);
    }
  });
});

describe('buildContextMeshes dashes and stalls', () => {
  it('splits a bike route into 2 m dashes with 2 m gaps', () => {
    const bikeway = feature({
      id: 'bikeway-1',
      kind: 'bikeway',
      source,
      geometry: {
        type: 'line',
        points: [
          { x: -200, y: -150 },
          { x: -180, y: -150 },
        ],
        widthM: 1.5,
      },
    });
    const mesh = buildContextMeshes(only([bikeway]), heightmap).lines.bikeway;
    const dashes = 20 / (BIKEWAY_DASH_M + BIKEWAY_DASH_M);
    // Each straight dash is one quad: two points with two sides each.
    expect(vertexCount(mesh)).toBe(dashes * 4);
  });

  it('triangulates each parking stall', () => {
    const stall = feature({
      id: 'parking-1',
      kind: 'parking',
      source: { ...source, datasetId: 'parking-meters' },
      geometry: {
        type: 'polygon',
        ring: [
          { x: 20, y: -110 },
          { x: 26, y: -110 },
          { x: 26, y: -107.6 },
          { x: 20, y: -107.6 },
        ],
      },
    });
    const mesh = buildContextMeshes(only([stall]), heightmap).parking;
    expect(vertexCount(mesh)).toBe(4);
    expect(mesh.indices).toHaveLength(6);
  });
});

describe('buildContextMeshes pins and labels', () => {
  it('places a pin at each bus stop with its name, on the ground', () => {
    const meshes = buildContextMeshes(sampleSiteContext, heightmap);
    meshes.busStops.forEach((stop) => {
      expect(stop.name.length).toBeGreaterThan(0);
      expect(stop.position.y).toBeCloseTo(ground({ x: stop.position.x, z: stop.position.z }), 4);
    });
  });

  it('names up to 6 streets, the ones nearest the parcel first, each once', () => {
    const { labels } = buildContextMeshes(sampleSiteContext, heightmap);
    expect(labels.length).toBeLessThanOrEqual(MAX_STREET_LABELS);
    const names = labels.map((label) => label.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, 4).sort()).toEqual([
      'Columbia St',
      'Manitoba St',
      'W 7th Ave',
      'W 8th Ave',
    ]);
  });
});
