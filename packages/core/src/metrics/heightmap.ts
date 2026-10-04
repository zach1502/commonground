import type { HeightmapIssue } from '../errors.js';
import type { PlanePoint } from '../schema/geometry.js';

const HALF_CELL = 0.5;
// Central differences span one cell on each side of the point.
const CENTRAL_DIFFERENCE_SPAN = 2;

/**
 * Terrain elevations on a regular grid, row by row from the south-west corner.
 * Elevation k = j * width + i belongs to the centre of cell (i, j), which sits at
 * originLocal + ((i + 0.5) * resolutionM, (j + 0.5) * resolutionM).
 */
export interface Heightmap {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly elevations: Float32Array;
  readonly originLocal: PlanePoint;
  /**
   * The parcel outline in the same frame, when the parcel is not its grid box. The ground is
   * drawn, edited and walked only inside it. Absent means the whole box is ground.
   */
  readonly groundOutline?: readonly PlanePoint[] | undefined;
}

export interface RampOptions {
  readonly width: number;
  readonly height: number;
  /** Rise over run toward east. */
  readonly gradeX?: number;
  /** Rise over run toward north. */
  readonly gradeY?: number;
  /** Elevation at the local origin (0, 0), in metres. */
  readonly baseM?: number;
  readonly resolutionM?: number;
  readonly originLocal?: PlanePoint;
}

export interface FlatOptions {
  readonly width: number;
  readonly height: number;
  readonly elevationM?: number;
  readonly resolutionM?: number;
  readonly originLocal?: PlanePoint;
}

/** A plane: elevation = baseM + gradeX * x + gradeY * y, sampled at cell centres. */
export function makeRampHeightmap(options: RampOptions): Heightmap {
  const { width, height, gradeX = 0, gradeY = 0, baseM = 0 } = options;
  const resolutionM = options.resolutionM ?? 1;
  const originLocal = options.originLocal ?? { x: 0, y: 0 };
  const elevations = new Float32Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const y = originLocal.y + (j + HALF_CELL) * resolutionM;
    for (let i = 0; i < width; i += 1) {
      const x = originLocal.x + (i + HALF_CELL) * resolutionM;
      elevations[j * width + i] = baseM + gradeX * x + gradeY * y;
    }
  }
  return { width, height, resolutionM, elevations, originLocal };
}

export function makeFlatHeightmap(options: FlatOptions): Heightmap {
  const { elevationM = 0, ...grid } = options;
  return makeRampHeightmap({ ...grid, baseM: elevationM });
}

/** Problems that stop a heightmap from being sampled. */
export function heightmapIssues(heightmap: Heightmap): HeightmapIssue[] {
  const { width, height, resolutionM, elevations } = heightmap;
  const issues: HeightmapIssue[] = [];
  const validSize = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
  if (!validSize || !(resolutionM > 0)) {
    issues.push({ kind: 'gridSize', width, height, resolutionM });
  }
  if (elevations.length !== width * height) {
    issues.push({ kind: 'elevationCount', expected: width * height, actual: elevations.length });
  }
  return issues;
}

function elevationAt(heightmap: Heightmap, i: number, j: number): number {
  return heightmap.elevations[j * heightmap.width + i] ?? 0;
}

interface AxisWeights {
  readonly low: number;
  readonly high: number;
  readonly t: number;
}

/** Splits a coordinate into the two neighbouring cell indexes and the blend between them. */
function axisWeights(offsetM: number, resolutionM: number, cellCount: number): AxisWeights {
  const u = Math.min(Math.max(offsetM / resolutionM - HALF_CELL, 0), cellCount - 1);
  const low = Math.floor(u);
  return { low, high: Math.min(low + 1, cellCount - 1), t: u - low };
}

/** Bilinear elevation at a point. Points outside the grid take the nearest edge value. */
export function sampleAt(heightmap: Heightmap, point: PlanePoint): number {
  const { originLocal, resolutionM } = heightmap;
  const u = axisWeights(point.x - originLocal.x, resolutionM, heightmap.width);
  const v = axisWeights(point.y - originLocal.y, resolutionM, heightmap.height);
  const south =
    elevationAt(heightmap, u.low, v.low) * (1 - u.t) + elevationAt(heightmap, u.high, v.low) * u.t;
  const north =
    elevationAt(heightmap, u.low, v.high) * (1 - u.t) +
    elevationAt(heightmap, u.high, v.high) * u.t;
  return south * (1 - v.t) + north * v.t;
}

/** A copy with each grade cell's delta added. Cells off the grid are ignored. */
/** A sparse set of per-cell changes, as in DesignDocument['gradeDelta']. */
export interface GradeDelta {
  readonly cells: readonly { readonly x: number; readonly y: number; readonly deltaM: number }[];
}

export function withGradeDelta(heightmap: Heightmap, gradeDelta: GradeDelta): Heightmap {
  const elevations = Float32Array.from(heightmap.elevations);
  gradeDelta.cells.forEach((cell) => {
    if (cell.x >= heightmap.width || cell.y >= heightmap.height) return;
    const index = cell.y * heightmap.width + cell.x;
    elevations[index] = (elevations[index] ?? 0) + cell.deltaM;
  });
  return { ...heightmap, elevations };
}

/** Steepest rise over run at a point, from central differences one cell apart. */
export function slopeAt(heightmap: Heightmap, point: PlanePoint): number {
  const step = heightmap.resolutionM;
  const east = sampleAt(heightmap, { x: point.x + step, y: point.y });
  const west = sampleAt(heightmap, { x: point.x - step, y: point.y });
  const north = sampleAt(heightmap, { x: point.x, y: point.y + step });
  const south = sampleAt(heightmap, { x: point.x, y: point.y - step });
  return Math.hypot(east - west, north - south) / (CENTRAL_DIFFERENCE_SPAN * step);
}
