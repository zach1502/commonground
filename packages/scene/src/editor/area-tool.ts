import {
  modulePlotCount,
  polygonArea,
  polygonSchema,
  ringEdges,
  type AreaCatalogItem,
  type PlanePoint,
} from '@parkshape/core';

export interface AreaSummary {
  readonly areaM2: number;
  readonly plots: number;
  readonly minAreaM2: number;
  readonly size: 'ok' | 'too-small';
}

/** An axis-aligned rectangle between two dragged corners, counter-clockwise from south-west. */
export function rectangleFromDrag(start: PlanePoint, end: PlanePoint): PlanePoint[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function moveVertex(
  polygon: readonly PlanePoint[],
  index: number,
  point: PlanePoint,
): PlanePoint[] {
  return polygon.map((vertex, position) => (position === index ? point : vertex));
}

/** Shifts edge edgeIndex, which runs from corner i to corner i + 1 (wrapping), by delta. */
export function moveEdge(
  polygon: readonly PlanePoint[],
  edgeIndex: number,
  delta: PlanePoint,
): PlanePoint[] {
  const next = (edgeIndex + 1) % polygon.length;
  return polygon.map((vertex, position) =>
    position === edgeIndex || position === next
      ? { x: vertex.x + delta.x, y: vertex.y + delta.y }
      : vertex,
  );
}

function closestOnEdge(point: PlanePoint, from: PlanePoint, to: PlanePoint): PlanePoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);
  return { x: from.x + t * dx, y: from.y + t * dy };
}

/** Puts a new corner on the edge nearest the point, at the spot on that edge closest to it. */
export function addCorner(polygon: readonly PlanePoint[], near: PlanePoint): PlanePoint[] {
  const candidates = ringEdges(polygon).map((edge, index) => {
    const corner = closestOnEdge(near, edge.from, edge.to);
    return { index, corner, distance: Math.hypot(corner.x - near.x, corner.y - near.y) };
  });
  const best = candidates.reduce((a, b) => (b.distance < a.distance ? b : a));
  return [...polygon.slice(0, best.index + 1), best.corner, ...polygon.slice(best.index + 1)];
}

/** Area in square metres and plot count, using the same module fitting as the metrics. */
export function areaSummary(entry: AreaCatalogItem, polygon: readonly PlanePoint[]): AreaSummary {
  const ring = polygonSchema.parse(polygon);
  const areaM2: number = polygonArea(ring);
  const { minAreaM2 } = entry.footprint;
  return {
    areaM2,
    plots: modulePlotCount(entry, ring),
    minAreaM2,
    size: areaM2 >= minAreaM2 ? 'ok' : 'too-small',
  };
}
