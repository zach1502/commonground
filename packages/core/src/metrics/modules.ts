import type { AreaModule } from '../schema/catalog.js';
import { polygonContains, ringEdges, type PlanePoint } from '../schema/geometry.js';

// Pulls a candidate's edges in from the exact boundary, so a bed whose aisle ends on the polygon
// edge still fits despite rounding.
const EDGE_CLEARANCE_M = 1e-6;

export type ModuleSize = {
  readonly [K in keyof Pick<AreaModule, 'widthM' | 'depthM' | 'aisleM'>]: number;
};

/** One module, axis-aligned, by its south-west corner. */
export interface ModulePlacement {
  readonly origin: PlanePoint;
  readonly widthM: number;
  readonly depthM: number;
}

export interface ModuleFit {
  readonly count: number;
  readonly placements: readonly ModulePlacement[];
}

function boundsOf(polygon: readonly PlanePoint[]) {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Starting offsets along one axis: an aisle, then module plus aisle repeated while it fits. */
function axisOffsets(min: number, max: number, sizeM: number, aisleM: number): number[] {
  const pitch = sizeM + aisleM;
  const count = Math.max(0, Math.floor((max - min - aisleM) / pitch + EDGE_CLEARANCE_M));
  return Array.from({ length: count }, (_, index) => min + aisleM + index * pitch);
}

interface Segment {
  readonly from: PlanePoint;
  readonly to: PlanePoint;
}

function cross(a: PlanePoint, b: PlanePoint, c: PlanePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True when the two segments cross at a point inside both. */
function segmentsCross(first: Segment, second: Segment): boolean {
  const d1 = cross(second.from, second.to, first.from);
  const d2 = cross(second.from, second.to, first.to);
  const d3 = cross(first.from, first.to, second.from);
  const d4 = cross(first.from, first.to, second.to);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The bed plus its aisle on every side must lie inside the polygon. */
function clearanceFits(
  polygon: readonly PlanePoint[],
  placement: ModulePlacement,
  aisleM: number,
): boolean {
  const reach = aisleM - EDGE_CLEARANCE_M;
  const { origin, widthM, depthM } = placement;
  const minX = origin.x - reach;
  const minY = origin.y - reach;
  const maxX = origin.x + widthM + reach;
  const maxY = origin.y + depthM + reach;
  const corners: PlanePoint[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  if (!corners.every((corner) => polygonContains(polygon, corner))) return false;
  const sides = corners.map((from, index) => ({
    from,
    to: corners[(index + 1) % corners.length] ?? from,
  }));
  return !ringEdges(polygon).some((edge) => sides.some((side) => segmentsCross(edge, side)));
}

/** Fixed-size modules on a regular grid inside a polygon, each with an aisle on every side. */
export function fitModules(polygon: readonly PlanePoint[], size: ModuleSize): ModuleFit {
  const { minX, minY, maxX, maxY } = boundsOf(polygon);
  const xs = axisOffsets(minX, maxX, size.widthM, size.aisleM);
  const ys = axisOffsets(minY, maxY, size.depthM, size.aisleM);
  const placements = ys
    .flatMap((y) => xs.map((x) => ({ origin: { x, y }, widthM: size.widthM, depthM: size.depthM })))
    .filter((placement) => clearanceFits(polygon, placement, size.aisleM));
  return { count: placements.length, placements };
}
