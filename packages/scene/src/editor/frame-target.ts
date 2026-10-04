import type {
  ConstraintKey,
  DesignDocument,
  MetricsReport,
  PlanePoint,
  Zone,
} from '@parkshape/core';

export type FrameTargetKind = 'item' | 'path' | 'area' | 'zone';

/** The element a "Show me" action moves the camera to, with the ground point to centre on. */
export interface FrameTarget {
  readonly kind: FrameTargetKind;
  readonly id: string;
  readonly point: PlanePoint;
}

export interface FrameContext {
  readonly document: DesignDocument;
  readonly zones: readonly Zone[];
  readonly report: MetricsReport;
}

function centroid(points: readonly PlanePoint[]): PlanePoint {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function firstItem(document: DesignDocument): FrameTarget | null {
  const [item] = document.items;
  return item === undefined ? null : { kind: 'item', id: item.id, point: item.position };
}

function firstArea(document: DesignDocument): FrameTarget | null {
  const [area] = document.areas;
  return area === undefined
    ? firstItem(document)
    : { kind: 'area', id: area.id, point: centroid(area.polygon) };
}

function firstForbiddenZone({ document, zones }: FrameContext): FrameTarget | null {
  const zone = zones.find((candidate) => candidate.kind === 'forbidden');
  return zone === undefined
    ? firstItem(document)
    : { kind: 'zone', id: zone.id, point: centroid(zone.polygon) };
}

function steepPath({ document, report }: FrameContext): FrameTarget | null {
  const steep = report.details.pathSlopes.find(
    (path) => !path.existing && (path.runningSegments.length > 0 || path.crossSegments.length > 0),
  );
  const path = document.paths.find((candidate) => candidate.id === steep?.pathId);
  return path === undefined ? null : { kind: 'path', id: path.id, point: centroid(path.points) };
}

type Resolver = (context: FrameContext) => FrameTarget | null;

const RESOLVERS: Partial<Record<ConstraintKey, Resolver>> = {
  requiredFeatures: ({ document }) => firstArea(document),
  forbiddenZones: firstForbiddenZone,
  slopes: steepPath,
  counts: ({ document }) => firstItem(document),
  treeProtection: ({ document }) => firstItem(document),
};

/** The element to frame for a failed constraint, or null when the constraint has no one place. */
export function frameTargetForConstraint(
  key: ConstraintKey,
  context: FrameContext,
): FrameTarget | null {
  return (RESOLVERS[key] ?? (() => null))(context);
}
