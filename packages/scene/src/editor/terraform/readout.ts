import {
  formatCubicMetres,
  formatPercent,
  lockedTrees,
  measureTerraform,
  plural,
  rasterizePolygon,
  type DesignDocument,
  type Grid,
  type Mask,
  type TerraformMeasure,
} from '@parkshape/core';

import type { EditorContext } from '../actions/context.js';

const PERCENT_TO_FRACTION = 100;

/** The parcel as a full-grid mask; the editor's terrain spans exactly the parcel. */
function parcelMask(grid: Grid): Mask {
  const { originLocal, cellM, width, height } = grid;
  const maxX = originLocal.x + width * cellM;
  const maxY = originLocal.y + height * cellM;
  return rasterizePolygon(grid, [
    { x: originLocal.x, y: originLocal.y },
    { x: maxX, y: originLocal.y },
    { x: maxX, y: maxY },
    { x: originLocal.x, y: maxY },
  ]);
}

/** Earthworks for the current grade delta, straight from the core metric. */
export function terraformReadout(ctx: EditorContext, document: DesignDocument): TerraformMeasure {
  return measureTerraform({
    grid: ctx.grid,
    parcel: parcelMask(ctx.grid),
    gradeDelta: document.gradeDelta,
    lockedTrees: lockedTrees(document, ctx.catalog),
    noGradeZones: ctx.zones,
    maxDeviationM: ctx.terraform.maxDeviationM,
    rootZonePerDbhCm: ctx.terraform.rootZonePerDbhCm,
  });
}

export interface ReadoutText {
  readonly cut: string;
  readonly fill: string;
  readonly net: string;
  readonly trucks: string;
  readonly disturbed: string;
}

/** Formats a measure through the core en-CA formatters, ready to drop into label templates. */
export function formatReadout(measure: TerraformMeasure): ReadoutText {
  return {
    cut: formatCubicMetres(measure.cut),
    fill: formatCubicMetres(measure.fill),
    net: formatCubicMetres(measure.net),
    trucks: plural(measure.truckTrips, 'truck trip'),
    disturbed: formatPercent(measure.disturbedPercent / PERCENT_TO_FRACTION),
  };
}
