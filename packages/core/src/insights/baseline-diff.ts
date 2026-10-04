import type { CatalogIndex } from '../catalog/catalog.js';
import { BASELINE_MOVED_M, BASELINE_RESIZED_SHARE, PERCENT_SCALE } from '../constants.js';
import { pathEntryId, type ElementKind } from '../metrics/footprints.js';
import type { Grid } from '../metrics/raster.js';
import type { DesignArea, DesignDocument, DesignItem, DesignPath } from '../schema/design.js';
import { polygonArea, type PlanePoint } from '../schema/geometry.js';

import type { InsightDesign } from './types.js';

export interface BaselineFeatureDiff {
  readonly featureId: string;
  readonly kind: ElementKind;
  /** Catalog name, such as "Garry oak". */
  readonly label: string;
  /** Which ninth of the site the feature sits in, so rows with one name can be told apart. */
  readonly where: SiteSection;
  readonly movedPercent: number;
  readonly removedPercent: number;
  readonly resizedPercent: number;
}

// The 3 by 3 split of a site, south to north and each row west to east.
export const SITE_SECTIONS = [
  'south-west',
  'south',
  'south-east',
  'west',
  'centre',
  'east',
  'north-west',
  'north',
  'north-east',
] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];
const THIRDS = 3;

function third(offset: number, span: number): number {
  return Math.min(THIRDS - 1, Math.max(0, Math.floor((offset / span) * THIRDS)));
}

/** The ninth of the grid a point falls in; y grows to the north. */
export function siteSection(point: PlanePoint, grid: Grid): SiteSection {
  const column = third(point.x - grid.originLocal.x, grid.width * grid.cellM);
  const row = third(point.y - grid.originLocal.y, grid.height * grid.cellM);
  return SITE_SECTIONS[row * THIRDS + column] ?? 'centre';
}

/** Where an element sits and how big it is, so any two kinds compare the same way. */
interface Shape {
  readonly centre: PlanePoint;
  readonly size: number;
}

interface BaselineFeature {
  readonly id: string;
  readonly kind: ElementKind;
  readonly label: string;
  readonly shapeIn: (document: DesignDocument) => Shape | undefined;
}

function meanPoint(points: readonly PlanePoint[]): PlanePoint {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

function polylineLength(points: readonly PlanePoint[]): number {
  return points
    .slice(1)
    .reduce(
      (sum, to, index) =>
        sum + Math.hypot(to.x - (points[index]?.x ?? to.x), to.y - (points[index]?.y ?? to.y)),
      0,
    );
}

function itemShape(item: DesignItem, catalog: CatalogIndex): Shape {
  const entry = catalog.get(item.catalogId);
  const footprint = entry?.geometryKind === 'point' ? entry.footprint : { widthM: 1, depthM: 1 };
  const jitter = item.scaleJitter ?? 1;
  return { centre: item.position, size: footprint.widthM * footprint.depthM * jitter * jitter };
}

const areaShape = (area: DesignArea): Shape => ({
  centre: meanPoint(area.polygon),
  size: polygonArea(area.polygon),
});

const pathShape = (path: DesignPath): Shape => ({
  centre: meanPoint(path.points),
  size: polylineLength(path.points) * path.widthM,
});

function baselineFeatures(baseline: DesignDocument, catalog: CatalogIndex): BaselineFeature[] {
  const nameOf = (catalogId: string) => catalog.get(catalogId)?.name ?? catalogId;
  const items = baseline.items.map((item) => ({
    id: item.id,
    kind: 'item' as const,
    label: nameOf(item.catalogId),
    shapeIn: (document: DesignDocument) => {
      const found = document.items.find(({ id }) => id === item.id);
      return found === undefined ? undefined : itemShape(found, catalog);
    },
  }));
  const areas = baseline.areas.map((area) => ({
    id: area.id,
    kind: 'area' as const,
    label: nameOf(area.catalogId),
    shapeIn: (document: DesignDocument) => {
      const found = document.areas.find(({ id }) => id === area.id);
      return found === undefined ? undefined : areaShape(found);
    },
  }));
  const paths = baseline.paths.map((path) => ({
    id: path.id,
    kind: 'path' as const,
    label: nameOf(pathEntryId(path.surface)),
    shapeIn: (document: DesignDocument) => {
      const found = document.paths.find(({ id }) => id === path.id);
      return found === undefined ? undefined : pathShape(found);
    },
  }));
  return [...items, ...areas, ...paths];
}

type Change = 'moved' | 'removed' | 'resized';

function changesOf(before: Shape, after: Shape | undefined): Change[] {
  if (after === undefined) return ['removed'];
  const changes: Change[] = [];
  const shift = Math.hypot(after.centre.x - before.centre.x, after.centre.y - before.centre.y);
  if (shift > BASELINE_MOVED_M) changes.push('moved');
  const growth = before.size === 0 ? 0 : Math.abs(after.size - before.size) / before.size;
  if (growth > BASELINE_RESIZED_SHARE) changes.push('resized');
  return changes;
}

/**
 * For each baseline item, area and path, the percent of designs that moved, removed or
 * resized it. Elements are matched by id; a design can both move and resize one feature.
 */
export function baselineDiff(
  baseline: DesignDocument | null,
  designs: readonly InsightDesign[],
  catalog: CatalogIndex,
  grid: Grid,
): BaselineFeatureDiff[] {
  if (baseline === null) return [];
  const percent = (count: number) =>
    designs.length === 0 ? 0 : (count / designs.length) * PERCENT_SCALE;
  return baselineFeatures(baseline, catalog).map((feature) => {
    const before = feature.shapeIn(baseline);
    const changes = designs.flatMap((design) =>
      before === undefined ? [] : changesOf(before, feature.shapeIn(design.document)),
    );
    const count = (change: Change) => changes.filter((found) => found === change).length;
    return {
      featureId: feature.id,
      kind: feature.kind,
      label: feature.label,
      where: siteSection(before?.centre ?? grid.originLocal, grid),
      movedPercent: percent(count('moved')),
      removedPercent: percent(count('removed')),
      resizedPercent: percent(count('resized')),
    };
  });
}
