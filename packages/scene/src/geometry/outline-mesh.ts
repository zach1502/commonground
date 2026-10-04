import {
  clamp,
  clipPolygonToBox,
  polygonContains,
  type Heightmap,
  type PlaneBox,
  type PlanePoint,
} from '@parkshape/core';

import { nodeCoordinates, nodePoint } from './grid.js';
import { polygonArea } from './measure.js';
import { triangulate } from './polygon.js';
import { elevationAt, lowestElevation } from './sample.js';
import {
  gridNormal,
  writeGrid,
  type TerrainArrays,
  type TerrainMeshOptions,
} from './terrain-mesh.js';
import { VECTOR_SIZE } from './vector-layout.js';

// A cut point this close to a grid node, in node units, reuses the node's vertex.
const NODE_SNAP = 1e-6;
// Cut points that agree to this many decimals of a metre are one shared vertex.
const KEY_DECIMALS = 6;
// Three points closer than this to one line make no corner, in square metres.
const COLLINEAR_M2 = 1e-12;
// Skirt sides shorter than this are the same point twice.
const MIN_SIDE_M = 1e-9;
// Each side of the skirt is one quad: two top and two bottom vertices.
const QUAD_VERTICES = 4;

interface SurfaceBuilder {
  readonly heightmap: Heightmap;
  readonly outline: readonly PlanePoint[];
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
  readonly cut: Map<string, number>;
}

const toGround = (point: PlanePoint) => ({ x: point.x, z: point.y });

/** The box between the outer grid nodes, where the island's surface can reach. */
function nodeSpan(heightmap: Heightmap): PlaneBox {
  return cellBox(heightmap, 0, 0, { across: heightmap.width - 1, up: heightmap.height - 1 });
}

function cellBox(
  heightmap: Heightmap,
  i: number,
  j: number,
  size = { across: 1, up: 1 },
): PlaneBox {
  const low = nodePoint(heightmap, i, j);
  const high = nodePoint(heightmap, i + size.across, j + size.up);
  return { minX: low.x, minY: low.z, maxX: high.x, maxY: high.z };
}

/** The grid node at a cut point, or a new vertex there at the terrain height. */
function vertexFor(builder: SurfaceBuilder, point: PlanePoint): number {
  const { heightmap } = builder;
  const { u, v } = nodeCoordinates(heightmap, toGround(point));
  const i = clamp(Math.round(u), 0, heightmap.width - 1);
  const j = clamp(Math.round(v), 0, heightmap.height - 1);
  if (Math.abs(u - i) < NODE_SNAP && Math.abs(v - j) < NODE_SNAP) return j * heightmap.width + i;
  const key = `${point.x.toFixed(KEY_DECIMALS)},${point.y.toFixed(KEY_DECIMALS)}`;
  const known = builder.cut.get(key);
  if (known !== undefined) return known;
  const index = builder.positions.length / VECTOR_SIZE;
  builder.positions.push(point.x, elevationAt(heightmap, toGround(point)), point.y);
  builder.normals.push(...gridNormal(heightmap, i, j));
  builder.cut.set(key, index);
  return index;
}

/** The ring without points that sit on the line through their neighbours. */
function cornersOf(ring: readonly PlanePoint[]): PlanePoint[] {
  return ring.filter((point, k) => {
    const before = ring[(k + ring.length - 1) % ring.length] ?? point;
    const after = ring[(k + 1) % ring.length] ?? point;
    const cross =
      (point.x - before.x) * (after.y - before.y) - (point.y - before.y) * (after.x - before.x);
    return Math.abs(cross) > COLLINEAR_M2;
  });
}

/** The part of one grid cell inside the outline, cut along the outline and triangulated. */
function writeCutCell(builder: SurfaceBuilder, i: number, j: number): void {
  const piece = cornersOf(clipPolygonToBox(builder.outline, cellBox(builder.heightmap, i, j)));
  if (piece.length < VECTOR_SIZE) return;
  const vertices = piece.map((point) => vertexFor(builder, point));
  triangulate(piece.map(toGround)).forEach((k) => {
    builder.indices.push(vertices[k] ?? 0);
  });
}

/** 1 for each grid node inside the outline. */
function nodesInside(heightmap: Heightmap, outline: readonly PlanePoint[]): Uint8Array {
  const inside = new Uint8Array(heightmap.width * heightmap.height);
  inside.forEach((_, index) => {
    const node = nodePoint(heightmap, index % heightmap.width, Math.floor(index / heightmap.width));
    inside[index] = polygonContains(outline, { x: node.x, y: node.z }) ? 1 : 0;
  });
  return inside;
}

/** Cells that hold an outline corner, on their sides too; they are cut even with all nodes in. */
function cellsWithCorners(heightmap: Heightmap, outline: readonly PlanePoint[]): Set<number> {
  const cells = new Set<number>();
  const offsets = [-NODE_SNAP, NODE_SNAP];
  outline.forEach((corner) => {
    const { u, v } = nodeCoordinates(heightmap, toGround(corner));
    offsets.forEach((du) => {
      offsets.forEach((dv) => {
        const i = Math.floor(u + du);
        const j = Math.floor(v + dv);
        if (i >= 0 && j >= 0 && i < heightmap.width - 1 && j < heightmap.height - 1) {
          cells.add(j * (heightmap.width - 1) + i);
        }
      });
    });
  });
  return cells;
}

/** Whole cells inside the outline keep the grid's two triangles; the rest are cut. */
function writeSurface(builder: SurfaceBuilder): void {
  const { heightmap } = builder;
  const { width, height } = heightmap;
  const inside = nodesInside(heightmap, builder.outline);
  const cornered = cellsWithCorners(heightmap, builder.outline);
  for (let j = 0; j < height - 1; j += 1) {
    for (let i = 0; i < width - 1; i += 1) {
      const a = j * width + i;
      const whole = [a, a + 1, a + width, a + width + 1].every((node) => inside[node] === 1);
      if (whole && !cornered.has(j * (width - 1) + i)) {
        builder.indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      } else {
        writeCutCell(builder, i, j);
      }
    }
  }
}

/** Points where a side crosses the grid lines between its ends, in order from its start. */
function gridCrossings(heightmap: Heightmap, from: PlanePoint, to: PlanePoint): PlanePoint[] {
  const start = nodeCoordinates(heightmap, toGround(from));
  const end = nodeCoordinates(heightmap, toGround(to));
  const steps: number[] = [];
  const crossAxis = (a: number, b: number) => {
    for (let line = Math.floor(Math.min(a, b)) + 1; line < Math.max(a, b); line += 1) {
      steps.push((line - a) / (b - a));
    }
  };
  crossAxis(start.u, end.u);
  crossAxis(start.v, end.v);
  return steps
    .sort((a, b) => a - b)
    .map((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }));
}

/** The island's edge, anticlockwise, with a point at every grid line the surface is cut on. */
function edgeProfile(heightmap: Heightmap, outline: readonly PlanePoint[]): PlanePoint[] {
  const edge = clipPolygonToBox(outline, nodeSpan(heightmap));
  const ring = polygonArea(edge.map(toGround)) < 0 ? edge : [...edge].reverse();
  return ring.flatMap((from, k) => [
    from,
    ...gridCrossings(heightmap, from, ring[(k + 1) % ring.length] ?? from),
  ]);
}

/** One flat quad per edge piece, from the ground down to the base, facing out. */
function writeSkirt(builder: SurfaceBuilder, baseY: number): void {
  const profile = edgeProfile(builder.heightmap, builder.outline);
  profile.forEach((from, k) => {
    const to = profile[(k + 1) % profile.length] ?? from;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < MIN_SIDE_M) return;
    const normal = [(to.y - from.y) / length, 0, (from.x - to.x) / length];
    const first = builder.positions.length / VECTOR_SIZE;
    [from, to].forEach((point) => {
      builder.positions.push(point.x, elevationAt(builder.heightmap, toGround(point)), point.y);
    });
    [from, to].forEach((point) => {
      builder.positions.push(point.x, baseY, point.y);
    });
    for (let n = 0; n < QUAD_VERTICES; n += 1) builder.normals.push(...normal);
    const topTo = first + 1;
    const baseFrom = topTo + 1;
    const baseTo = baseFrom + 1;
    builder.indices.push(first, topTo, baseFrom, topTo, baseTo, baseFrom);
  });
}

/**
 * The terrain surface inside a parcel outline, with the cells on the outline cut along it, and a
 * skirt that follows the outline down to a flat base under the island.
 */
export function buildOutlineMesh(
  heightmap: Heightmap,
  outline: readonly PlanePoint[],
  options: TerrainMeshOptions,
): TerrainArrays {
  const gridCount = heightmap.width * heightmap.height;
  const positions = new Float32Array(gridCount * VECTOR_SIZE);
  const normals = new Float32Array(gridCount * VECTOR_SIZE);
  writeGrid(heightmap, positions, normals);
  const builder: SurfaceBuilder = {
    heightmap,
    outline,
    positions: Array.from(positions),
    normals: Array.from(normals),
    indices: [],
    cut: new Map(),
  };
  writeSurface(builder);
  const surfaceVertexCount = builder.positions.length / VECTOR_SIZE;
  const surfaceIndexCount = builder.indices.length;
  writeSkirt(builder, lowestElevation(heightmap) - options.skirtDepthM);
  return {
    positions: Float32Array.from(builder.positions),
    normals: Float32Array.from(builder.normals),
    indices: Uint32Array.from(builder.indices),
    surfaceVertexCount,
    surfaceIndexCount,
  };
}
