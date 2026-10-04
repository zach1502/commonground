import type { CatalogIndex } from '../catalog/catalog.js';
import { PERCENT_SCALE, TRUCK_VOLUME_M3 } from '../constants.js';
import type { DesignDocument, Zone } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';
import type { ItemId } from '../schema/ids.js';

import {
  countCells,
  emptyMask,
  intersectCount,
  rasterizeCircle,
  rasterizePolygon,
  type Grid,
  type Mask,
} from './raster.js';

export interface LockedTree {
  readonly id: ItemId;
  readonly label: string;
  readonly position: PlanePoint;
  readonly dbhCm: number;
}

export interface TerraformInput {
  readonly grid: Grid;
  readonly parcel: Mask;
  readonly gradeDelta: DesignDocument['gradeDelta'];
  readonly lockedTrees: readonly LockedTree[];
  /** Zones of any kind; only no-grade zones are checked. */
  readonly noGradeZones: readonly Zone[];
  readonly maxDeviationM: number;
  readonly rootZonePerDbhCm: number;
}

export interface RootZoneHit {
  readonly treeId: ItemId;
  readonly label: string;
  readonly radiusM: number;
  readonly cells: number;
}

export interface NoGradeHit {
  readonly zoneId: ItemId;
  readonly zoneLabel: string;
  readonly cells: number;
}

export interface TerraformMeasure {
  readonly cut: number;
  readonly fill: number;
  /** Fill minus cut, in cubic metres. */
  readonly net: number;
  readonly truckTrips: number;
  readonly disturbedPercent: number;
  /** Cells whose change is larger than maxDeviationM either way. */
  readonly deviationCells: number;
  readonly largestDeviationM: number;
  readonly rootZoneHits: readonly RootZoneHit[];
  readonly noGradeHits: readonly NoGradeHit[];
}

/** Locked trees with the measured trunk diameter, or the catalog's mature one. */
export function lockedTrees(document: DesignDocument, catalog: CatalogIndex): LockedTree[] {
  return document.items.flatMap((item) => {
    const entry = catalog.get(item.catalogId);
    const dbhCm = item.dbhCm ?? entry?.matureDbhCm;
    if (!item.locked || entry?.category !== 'tree' || dbhCm === undefined) return [];
    return [{ id: item.id, label: entry.name, position: item.position, dbhCm }];
  });
}

/** Net change per cell, with repeated cells summed and cells off the grid dropped. */
function deltaField(grid: Grid, gradeDelta: DesignDocument['gradeDelta']): Float64Array {
  const field = new Float64Array(grid.width * grid.height);
  gradeDelta.cells.forEach(({ x, y, deltaM }) => {
    if (x >= grid.width || y >= grid.height) return;
    const index = y * grid.width + x;
    field[index] = (field[index] ?? 0) + deltaM;
  });
  return field;
}

function changedMask(grid: Grid, field: Float64Array): Mask {
  const mask = emptyMask(grid);
  field.forEach((delta, index) => {
    if (delta !== 0) mask.cells[index] = 1;
  });
  return mask;
}

function volumes(field: Float64Array, cellAreaM2: number) {
  let cut = 0;
  let fill = 0;
  field.forEach((delta) => {
    if (delta < 0) cut -= delta * cellAreaM2;
    else fill += delta * cellAreaM2;
  });
  return { cut, fill, net: fill - cut };
}

function deviation(field: Float64Array, maxDeviationM: number) {
  const magnitudes = [...field].map(Math.abs);
  return {
    deviationCells: magnitudes.filter((magnitude) => magnitude > maxDeviationM).length,
    largestDeviationM: Math.max(0, ...magnitudes),
  };
}

function protectedHits(input: TerraformInput, changed: Mask) {
  const rootZoneHits = input.lockedTrees.flatMap((tree) => {
    const radiusM = input.rootZonePerDbhCm * tree.dbhCm;
    const cells = intersectCount(rasterizeCircle(input.grid, tree.position, radiusM), changed);
    return cells === 0 ? [] : [{ treeId: tree.id, label: tree.label, radiusM, cells }];
  });
  const noGradeHits = input.noGradeZones
    .filter((zone) => zone.kind === 'noGrade')
    .flatMap((zone) => {
      const cells = intersectCount(rasterizePolygon(input.grid, zone.polygon), changed);
      return cells === 0 ? [] : [{ zoneId: zone.id, zoneLabel: zone.label, cells }];
    });
  return { rootZoneHits, noGradeHits };
}

/** Earthworks from the grade delta: volumes, truck loads, disturbance and protected areas hit. */
export function measureTerraform(input: TerraformInput): TerraformMeasure {
  const { grid, parcel } = input;
  const field = deltaField(grid, input.gradeDelta);
  const changed = changedMask(grid, field);
  const volume = volumes(field, grid.cellM * grid.cellM);
  const parcelCells = countCells(parcel);
  const disturbedCells = intersectCount(changed, parcel);
  return {
    ...volume,
    truckTrips: Math.ceil(Math.abs(volume.net) / TRUCK_VOLUME_M3),
    disturbedPercent: parcelCells === 0 ? 0 : (disturbedCells / parcelCells) * PERCENT_SCALE,
    ...deviation(field, input.maxDeviationM),
    ...protectedHits(input, changed),
  };
}
