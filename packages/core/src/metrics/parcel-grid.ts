import { GRID_RESOLUTION_M } from '../constants.js';
import type { PlanePoint } from '../schema/geometry.js';
import type { Parcel } from '../schema/parcel.js';

/** The size and placement of a heightmap grid, without its elevations. */
export interface GridSize {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly originLocal: PlanePoint;
}

/** A grid over the parcel's bounding box, its corner snapped down to a whole cell. */
export function parcelGrid(parcel: Parcel, resolutionM: number = GRID_RESOLUTION_M): GridSize {
  const xs = parcel.polygon.map((point) => point.x);
  const ys = parcel.polygon.map((point) => point.y);
  const snap = (value: number) => Math.floor(value / resolutionM) * resolutionM;
  const originLocal = { x: snap(Math.min(...xs)), y: snap(Math.min(...ys)) };
  return {
    width: Math.ceil((Math.max(...xs) - originLocal.x) / resolutionM),
    height: Math.ceil((Math.max(...ys) - originLocal.y) / resolutionM),
    resolutionM,
    originLocal,
  };
}
