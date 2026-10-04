import { itemAt, valueAt } from '../geometry/arrays.js';
import { isInsidePolygon, triangulate } from '../geometry/polygon.js';
import { HALF, VECTOR_SIZE, Y_OFFSET, Z_OFFSET } from '../geometry/vector-layout.js';
import type { GroundPoint, MeshArrays } from '../types.js';

type Ring = readonly GroundPoint[];

/** A point of a cut triangle, with its weights on the triangle's three corners. */
interface Corner {
  readonly x: number;
  readonly z: number;
  readonly weights: readonly number[];
}

/** One convex piece of the park ground, with the sign that makes its inside positive. */
interface Cutter {
  readonly corners: Ring;
  readonly turn: number;
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

// Pieces smaller than this, in square metres, are slivers along a cut and are dropped.
const SLIVER_M2 = 1e-9;
const UNIT_WEIGHTS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;

function cross(a: GroundPoint, b: GroundPoint, point: GroundPoint): number {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
}

function twiceArea(ring: Ring): number {
  return ring.reduce(
    (sum, point, index) => sum + cross(ring[0] ?? point, point, itemAt(ring, index + 1)),
    0,
  );
}

function boxOf(ring: Ring): Box {
  const xs = ring.map((point) => point.x);
  const zs = ring.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function boxesMeet(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ;
}

function cuttersOf(region: Ring): Cutter[] {
  const order = triangulate(region);
  const cutters: Cutter[] = [];
  for (let k = 0; k + VECTOR_SIZE <= order.length; k += VECTOR_SIZE) {
    const corners = order.slice(k, k + VECTOR_SIZE).map((index) => itemAt(region, index));
    const turn = Math.sign(twiceArea(corners));
    if (turn !== 0) cutters.push({ corners, turn });
  }
  return cutters;
}

function between(a: Corner, b: Corner, t: number): Corner {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    weights: a.weights.map((weight, k) => weight + (valueAt(b.weights, k) - weight) * t),
  };
}

/** Sutherland-Hodgman against one side line: 'inside' keeps the cutter's side, 'outside' the other. */
function clipToSide(
  ring: readonly Corner[],
  side: { readonly from: GroundPoint; readonly to: GroundPoint; readonly sign: number },
): Corner[] {
  const signed = (corner: Corner) => cross(side.from, side.to, corner) * side.sign;
  const kept: Corner[] = [];
  ring.forEach((current, index) => {
    const previous = itemAt(ring, index - 1);
    const now = signed(current);
    const before = signed(previous);
    if (now >= 0 !== before >= 0) kept.push(between(previous, current, before / (before - now)));
    if (now >= 0) kept.push(current);
  });
  return kept;
}

function sidesOf(cutter: Cutter) {
  return cutter.corners.map((from, index) => ({ from, to: itemAt(cutter.corners, index + 1) }));
}

function overlaps(piece: readonly Corner[], cutter: Cutter): boolean {
  const common = sidesOf(cutter).reduce<Corner[]>(
    (ring, side) => (ring.length === 0 ? ring : clipToSide(ring, { ...side, sign: cutter.turn })),
    [...piece],
  );
  return Math.abs(twiceArea(common)) * HALF > SLIVER_M2;
}

/** A convex piece less a convex cutter, as convex pieces that do not overlap each other. */
function subtract(piece: Corner[], cutter: Cutter): Corner[][] {
  if (!overlaps(piece, cutter)) return [piece];
  const pieces: Corner[][] = [];
  let rest = piece;
  for (const side of sidesOf(cutter)) {
    const outside = clipToSide(rest, { ...side, sign: -cutter.turn });
    if (Math.abs(twiceArea(outside)) * HALF > SLIVER_M2) pieces.push(outside);
    rest = clipToSide(rest, { ...side, sign: cutter.turn });
    if (rest.length === 0) break;
  }
  return pieces;
}

class MeshWriter {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  private readonly reused = new Map<number, number>();

  constructor(private readonly source: MeshArrays) {}

  original(vertex: number): number {
    const known = this.reused.get(vertex);
    if (known !== undefined) return known;
    const start = vertex * VECTOR_SIZE;
    const slot = this.add(
      [...this.source.positions.slice(start, start + VECTOR_SIZE)],
      [...this.source.normals.slice(start, start + VECTOR_SIZE)],
    );
    this.reused.set(vertex, slot);
    return slot;
  }

  blended(triangle: readonly number[], corner: Corner): number {
    const mix = (values: Float32Array) =>
      [0, Y_OFFSET, Z_OFFSET].map((axis) =>
        triangle.reduce(
          (sum, vertex, k) =>
            sum + valueAt(values, vertex * VECTOR_SIZE + axis) * valueAt(corner.weights, k),
          0,
        ),
      );
    const normal = mix(this.source.normals);
    const length = Math.hypot(...normal) || 1;
    return this.add(
      mix(this.source.positions),
      normal.map((value) => value / length),
    );
  }

  private add(position: readonly number[], normal: readonly number[]): number {
    this.positions.push(...position);
    this.normals.push(...normal);
    return this.positions.length / VECTOR_SIZE - 1;
  }

  build(): MeshArrays {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      indices: Uint32Array.from(this.indices),
    };
  }
}

function groundOf(mesh: MeshArrays, vertex: number): GroundPoint {
  return {
    x: valueAt(mesh.positions, vertex * VECTOR_SIZE),
    z: valueAt(mesh.positions, vertex * VECTOR_SIZE + Z_OFFSET),
  };
}

function writePieces(writer: MeshWriter, triangle: readonly number[], pieces: readonly Corner[][]) {
  pieces.forEach((piece) => {
    const [head, ...rest] = piece.map((corner) => writer.blended(triangle, corner));
    if (head === undefined) return;
    rest.slice(0, -1).forEach((slot, k) => {
      writer.indices.push(head, slot, valueAt(rest, k + 1));
    });
  });
}

/**
 * The part of a ground mesh outside a region: each triangle that reaches into the region is cut
 * to convex pieces outside it, with heights and normals blended from the triangle's corners.
 */
export function clipMeshOutside(mesh: MeshArrays, region: Ring): MeshArrays {
  const cutters = cuttersOf(region);
  const regionBox = boxOf(region);
  const writer = new MeshWriter(mesh);
  let cut = false;
  for (let k = 0; k + VECTOR_SIZE <= mesh.indices.length; k += VECTOR_SIZE) {
    const triangle = [...mesh.indices.slice(k, k + VECTOR_SIZE)];
    const first: Corner[] = triangle.map((vertex, n) => ({
      ...groundOf(mesh, vertex),
      weights: itemAt(UNIT_WEIGHTS, n),
    }));
    const pieces = boxesMeet(boxOf(first), regionBox)
      ? cutters.reduce<Corner[][]>(
          (all, cutter) => all.flatMap((piece) => subtract(piece, cutter)),
          [first],
        )
      : [first];
    if (pieces.length === 1 && pieces[0] === first) {
      writer.indices.push(...triangle.map((vertex) => writer.original(vertex)));
    } else {
      cut = true;
      writePieces(writer, triangle, pieces);
    }
  }
  return cut ? writer.build() : mesh;
}

function crossingsOf(from: GroundPoint, to: GroundPoint, region: Ring): number[] {
  return region.flatMap((a, index) => {
    const b = itemAt(region, index + 1);
    const fromSide = cross(a, b, from);
    const toSide = cross(a, b, to);
    if (fromSide === toSide) return [];
    const t = fromSide / (fromSide - toSide);
    const s = cross(from, to, a) / (cross(from, to, a) - cross(from, to, b));
    return t > 0 && t < 1 && s >= 0 && s <= 1 ? [t] : [];
  });
}

/** The pieces of a line outside a region, each as a two-point line. */
export function linePiecesOutside(points: Ring, region: Ring): GroundPoint[][] {
  return points.slice(1).flatMap((to, index) => {
    const from = itemAt(points, index);
    const at = (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
    });
    const cuts = [0, ...crossingsOf(from, to, region).sort((a, b) => a - b), 1];
    return cuts.slice(1).flatMap((end, k) => {
      const start = valueAt(cuts, k);
      return isInsidePolygon(region, at((start + end) * HALF)) ? [] : [[at(start), at(end)]];
    });
  });
}
