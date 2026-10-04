import { modulePlotCount } from '../catalog/catalog.js';
import type { AreaCatalogItem } from '../schema/catalog.js';
import type { DesignArea } from '../schema/design.js';
import { polygonContains, type PlanePoint } from '../schema/geometry.js';

// Corners this close count as the same point, so a JSON round trip never reads as an edit.
const SAME_POINT_M = 1e-6;

/** A site record with a location and, when the source lists one, its plot count. */
export interface PlotRecord {
  readonly position: PlanePoint;
  readonly plots?: number | undefined;
}

function samePolygon(first: readonly PlanePoint[], second: readonly PlanePoint[]): boolean {
  return (
    first.length === second.length &&
    first.every((point, index) => {
      const other = second[index];
      return (
        other !== undefined &&
        Math.abs(point.x - other.x) <= SAME_POINT_M &&
        Math.abs(point.y - other.y) <= SAME_POINT_M
      );
    })
  );
}

/**
 * The plot count the site record gives, taken from the baseline area with the same id and only
 * while the polygon is unchanged. The design's own field is not trusted, since residents edit it.
 */
function recordedPlotsOf(
  area: DesignArea,
  baselineAreas: readonly DesignArea[],
): number | undefined {
  const original = baselineAreas.find((candidate) => candidate.id === area.id);
  if (original?.recordedPlots === undefined || original.catalogId !== area.catalogId) {
    return undefined;
  }
  return samePolygon(original.polygon, area.polygon) ? original.recordedPlots : undefined;
}

/**
 * Plots an area holds: the recorded count for an existing garden kept as it is, or the beds
 * fitted in the polygon once it is drawn, moved or resized.
 */
export function areaPlotCount(
  entry: AreaCatalogItem,
  area: DesignArea,
  baselineAreas: readonly DesignArea[],
): number {
  return recordedPlotsOf(area, baselineAreas) ?? modulePlotCount(entry, area.polygon);
}

/** Total plots of the records inside the polygon, or undefined when none gives a count. */
export function plotsRecordedInside(
  polygon: readonly PlanePoint[],
  records: readonly PlotRecord[],
): number | undefined {
  const counts = records.flatMap(({ position, plots }) =>
    plots !== undefined && polygonContains(polygon, position) ? [plots] : [],
  );
  return counts.length === 0 ? undefined : counts.reduce((total, plots) => total + plots, 0);
}
