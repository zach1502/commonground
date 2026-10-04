import type { ContextFeature, Heightmap, SiteContext } from '@parkshape/core';

import { isInsidePolygon, triangulate } from '../geometry/polygon.js';
import { buildRibbonOn, type RibbonGround } from '../geometry/ribbon.js';
import { centreOf, heightmapBounds, type SceneBounds } from '../geometry/sample.js';
import { VECTOR_SIZE } from '../geometry/vector-layout.js';
import type { GroundPoint, MeshArrays, Vector3 } from '../types.js';

import { APRON_BLEND_M, apronElevation } from './apron.js';
import { dashesOf, densify } from './line-sampling.js';
import { clipMeshOutside, linePiecesOutside } from './outside-clip.js';

/** How far each kind sits above the apron, so the later layers draw over the earlier ones. */
export const CONTEXT_LIFT_M = {
  street: 0.03,
  sidewalk: 0.04,
  parking: 0.045,
  bikeway: 0.05,
} as const;
/** Bike routes draw as dashes this long with gaps as long. */
export const BIKEWAY_DASH_M = 2;
/** At most this many street names show, the nearest to the parcel first. */
export const MAX_STREET_LABELS = 6;
// Lines are sampled this finely where the apron eases, and this coarsely where it is flat.
const FINE_STEP_M = 2;
const COARSE_STEP_M = 20;

export type ContextLineKind = 'street' | 'sidewalk' | 'bikeway';

export interface BusStopPin {
  readonly id: string;
  readonly name: string;
  /** On the ground under the stop. */
  readonly position: Vector3;
}

export interface StreetLabel {
  readonly name: string;
  readonly position: Vector3;
}

/** One merged mesh per kind, the bus stop pins and the street names to label. */
export interface ContextMeshes {
  readonly lines: Readonly<Record<ContextLineKind, MeshArrays>>;
  readonly parking: MeshArrays;
  readonly busStops: readonly BusStopPin[];
  readonly labels: readonly StreetLabel[];
}

// Core's local y (north) is the scene's z; see geometry/grid.ts.
const ground = (point: { readonly x: number; readonly y: number }): GroundPoint => ({
  x: point.x,
  z: point.y,
});

/** Joins meshes into one, so each kind is a single draw call. */
export function mergeMeshes(meshes: readonly MeshArrays[]): MeshArrays {
  const vertices = meshes.reduce((sum, mesh) => sum + mesh.positions.length, 0);
  const indexCount = meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);
  const positions = new Float32Array(vertices);
  const normals = new Float32Array(vertices);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  meshes.forEach((mesh) => {
    positions.set(mesh.positions, vertexOffset);
    normals.set(mesh.normals, vertexOffset);
    const base = vertexOffset / VECTOR_SIZE;
    indices.set(
      mesh.indices.map((index) => index + base),
      indexOffset,
    );
    vertexOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
  });
  return { positions, normals, indices };
}

function distanceToBox(bounds: SceneBounds, point: GroundPoint): number {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const dz = Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

interface LayerGround {
  readonly at: RibbonGround;
  readonly bounds: SceneBounds;
  /** Where the park ground draws: the parcel outline, or the grid box when it has none. */
  readonly park: readonly GroundPoint[];
}

function parkGroundOf(heightmap: Heightmap, bounds: SceneBounds): GroundPoint[] {
  const outline = heightmap.groundOutline;
  if (outline !== undefined) return outline.map(ground);
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ];
}

function stepAt(layer: LayerGround) {
  return (point: GroundPoint) =>
    distanceToBox(layer.bounds, point) < APRON_BLEND_M + COARSE_STEP_M
      ? FINE_STEP_M
      : COARSE_STEP_M;
}

function linesOf(context: SiteContext, kind: ContextLineKind) {
  return context.features.flatMap((feature) =>
    feature.kind === kind && feature.geometry.type === 'line'
      ? [{ points: feature.geometry.points.map(ground), widthM: feature.geometry.widthM }]
      : [],
  );
}

function lineMesh(context: SiteContext, kind: ContextLineKind, layer: LayerGround): MeshArrays {
  const options = (widthM: number) => ({ widthM, liftM: CONTEXT_LIFT_M[kind] });
  const ribbons = linesOf(context, kind).flatMap(({ points, widthM }) => {
    if (kind === 'bikeway') {
      return dashesOf(points, BIKEWAY_DASH_M).map((dash) =>
        buildRibbonOn(layer.at, dash, options(widthM)),
      );
    }
    return [buildRibbonOn(layer.at, densify(points, stepAt(layer)), options(widthM))];
  });
  // Cut after widening, so no half-width reaches past the park edge.
  return clipMeshOutside(mergeMeshes(ribbons), layer.park);
}

function stallMesh(ring: readonly GroundPoint[], layer: LayerGround): MeshArrays {
  const positions = new Float32Array(ring.length * VECTOR_SIZE);
  const normals = new Float32Array(ring.length * VECTOR_SIZE);
  ring.forEach((point, index) => {
    positions.set(
      [point.x, layer.at(point) + CONTEXT_LIFT_M.parking, point.z],
      index * VECTOR_SIZE,
    );
    normals.set([0, 1, 0], index * VECTOR_SIZE);
  });
  return { positions, normals, indices: Uint32Array.from(triangulate(ring)) };
}

function parkingMesh(context: SiteContext, layer: LayerGround): MeshArrays {
  const stalls = mergeMeshes(
    context.features.flatMap((feature) =>
      feature.kind === 'parking' && feature.geometry.type === 'polygon'
        ? [stallMesh(feature.geometry.ring.map(ground), layer)]
        : [],
    ),
  );
  return clipMeshOutside(stalls, layer.park);
}

function onGround(layer: LayerGround, point: GroundPoint): Vector3 {
  return { x: point.x, y: layer.at(point), z: point.z };
}

/** The stops outside the park ground; a stop inside it would stand in the park. */
function busStopsOf(context: SiteContext, layer: LayerGround): BusStopPin[] {
  return context.features.flatMap((feature) =>
    feature.kind === 'busStop' &&
    feature.geometry.type === 'point' &&
    !isInsidePolygon(layer.park, ground(feature.geometry.position))
      ? [
          {
            id: feature.id,
            name: feature.name ?? '',
            position: onGround(layer, ground(feature.geometry.position)),
          },
        ]
      : [],
  );
}

function nearestOnLine(points: readonly GroundPoint[], target: GroundPoint): GroundPoint {
  let best: GroundPoint = points[0] ?? target;
  let bestDistance = Infinity;
  points.slice(1).forEach((to, index) => {
    const from = points[index] ?? to;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    const along =
      lengthSquared === 0
        ? 0
        : ((target.x - from.x) * dx + (target.z - from.z) * dz) / lengthSquared;
    const t = Math.min(Math.max(along, 0), 1);
    const candidate = { x: from.x + dx * t, z: from.z + dz * t };
    const distance = Math.hypot(candidate.x - target.x, candidate.z - target.z);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function namedStreets(context: SiteContext): ContextFeature[] {
  return context.features.filter(
    (feature) => feature.kind === 'street' && feature.name !== undefined,
  );
}

/** The point of a street outside the park nearest the target, if any of it is outside. */
function nearestOutside(
  points: readonly GroundPoint[],
  layer: LayerGround,
  target: GroundPoint,
): GroundPoint | undefined {
  const candidates = linePiecesOutside(points, layer.park).map((piece) =>
    nearestOnLine(piece, target),
  );
  const distance = (point: GroundPoint) => Math.hypot(point.x - target.x, point.z - target.z);
  return candidates.reduce<GroundPoint | undefined>(
    (best, point) => (best === undefined || distance(point) < distance(best) ? point : best),
    undefined,
  );
}

/**
 * One label per street name, at the point of the street outside the park nearest the parcel
 * centre. A street wholly inside the park gets no label.
 */
function streetLabelsOf(context: SiteContext, layer: LayerGround): StreetLabel[] {
  const centre = centreOf(layer.bounds);
  const target = { x: centre.x, z: centre.z };
  const nearest = new Map<string, { point: GroundPoint; distance: number }>();
  namedStreets(context).forEach((feature) => {
    if (feature.geometry.type !== 'line' || feature.name === undefined) return;
    const point = nearestOutside(feature.geometry.points.map(ground), layer, target);
    if (point === undefined) return;
    const distance = distanceToBox(layer.bounds, point);
    const known = nearest.get(feature.name);
    if (known === undefined || distance < known.distance)
      nearest.set(feature.name, { point, distance });
  });
  return [...nearest.entries()]
    .sort(([, a], [, b]) => a.distance - b.distance)
    .slice(0, MAX_STREET_LABELS)
    .map(([name, { point }]) => ({ name, position: onGround(layer, point) }));
}

/** Builds every context mesh on the apron around a heightmap. */
export function buildContextMeshes(context: SiteContext, heightmap: Heightmap): ContextMeshes {
  const bounds = heightmapBounds(heightmap);
  const layer: LayerGround = {
    at: apronElevation(heightmap),
    bounds,
    park: parkGroundOf(heightmap, bounds),
  };
  return {
    lines: {
      street: lineMesh(context, 'street', layer),
      sidewalk: lineMesh(context, 'sidewalk', layer),
      bikeway: lineMesh(context, 'bikeway', layer),
    },
    parking: parkingMesh(context, layer),
    busStops: busStopsOf(context, layer),
    labels: streetLabelsOf(context, layer),
  };
}
