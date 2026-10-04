import type { CatalogIndex } from '../catalog/catalog.js';
import { pathEntryId, type ElementKind } from '../metrics/footprints.js';
import { err, ok, type Result } from '../result.js';
import type { CatalogItem, Category } from '../schema/catalog.js';
import type { DesignArea, DesignDocument, DesignItem, DesignPath } from '../schema/design.js';
import {
  polygonContains,
  ringEdges,
  type LocalPoint,
  type PlanePoint,
} from '../schema/geometry.js';
import type { ItemId } from '../schema/ids.js';
import { compassZoneIn } from '../solver/hints.js';
import type { CompassZone } from '../solver/intent.js';

import type { ElementComment } from './element-comment.js';

const HALF = 0.5;
// The shoelace centroid divides by six times the area, which is three times the twice-area sum.
const CENTROID_TWICE_AREA_FACTOR = 3;
// A horizontal line enters and leaves a ring in pairs of crossings.
const CROSSINGS_PER_RUN = 2;

/** Names one element of a design document, as a selection or a comment points at it. */
export interface ElementRef {
  readonly elementId: ItemId;
  readonly elementKind: ElementKind;
}

type DocumentElement =
  | { readonly kind: 'item'; readonly item: DesignItem }
  | { readonly kind: 'path'; readonly path: DesignPath }
  | { readonly kind: 'area'; readonly area: DesignArea };

/** The element and the tap point a new comment names, before the server checks them. */
export interface AnchorInput {
  readonly elementId: string;
  readonly surfacePoint?: LocalPoint | undefined;
}

/** What the stored document says about the element; `surfacePoint` only for paths and areas. */
export interface ResolvedAnchor {
  readonly elementKind: ElementKind;
  readonly category: Category;
  readonly surfacePoint?: LocalPoint;
}

/**
 * `unknown-element`: the document has no item, path or area with this id, such as a deleted
 * element or a zone. `point-off-element`: the tap point is off the path ribbon or the area.
 */
export type AnchorError =
  | { readonly kind: 'unknown-element'; readonly elementId: string }
  | { readonly kind: 'point-off-element'; readonly elementId: string };

/** Catalog name and compass zone, such as Bench in the south-west. */
export interface ElementLabel {
  readonly name: string;
  readonly zone: CompassZone;
}

function findElement(document: DesignDocument, elementId: string): DocumentElement | undefined {
  const item = document.items.find((entry) => entry.id === elementId);
  if (item !== undefined) return { kind: 'item', item };
  const path = document.paths.find((entry) => entry.id === elementId);
  if (path !== undefined) return { kind: 'path', path };
  const area = document.areas.find((entry) => entry.id === elementId);
  return area === undefined ? undefined : { kind: 'area', area };
}

function entryOf(element: DocumentElement, catalog: CatalogIndex): CatalogItem | undefined {
  if (element.kind === 'item') return catalog.get(element.item.catalogId);
  if (element.kind === 'path') return catalog.get(pathEntryId(element.path.surface));
  return catalog.get(element.area.catalogId);
}

function distanceToSegment(point: PlanePoint, from: PlanePoint, to: PlanePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const along = lengthSq === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq;
  const t = Math.min(Math.max(along, 0), 1);
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

function segmentsOf(points: readonly PlanePoint[]): [PlanePoint, PlanePoint][] {
  return points.slice(1).map((to, index) => [points[index] ?? to, to]);
}

function onElement(element: DocumentElement, point: PlanePoint): boolean {
  if (element.kind === 'area') return polygonContains(element.area.polygon, point);
  if (element.kind === 'item') return true;
  const { points, widthM } = element.path;
  return segmentsOf(points).some(
    ([from, to]) => distanceToSegment(point, from, to) <= widthM * HALF,
  );
}

/**
 * Checks a new comment's element against the stored document and takes its kind and category
 * from there. A tap point on an item is dropped; one off a path ribbon or area is refused.
 */
export function resolveAnchor(
  document: DesignDocument,
  catalog: CatalogIndex,
  input: AnchorInput,
): Result<ResolvedAnchor, AnchorError> {
  const { elementId, surfacePoint } = input;
  const element = findElement(document, elementId);
  const entry = element === undefined ? undefined : entryOf(element, catalog);
  if (element === undefined || entry === undefined)
    return err({ kind: 'unknown-element', elementId });
  const resolved = { elementKind: element.kind, category: entry.category };
  if (element.kind === 'item' || surfacePoint === undefined) return ok(resolved);
  if (!onElement(element, surfacePoint)) return err({ kind: 'point-off-element', elementId });
  return ok({ ...resolved, surfacePoint });
}

function pathMidpoint(points: readonly PlanePoint[]): PlanePoint {
  const segments = segmentsOf(points);
  const lengths = segments.map(([from, to]) => Math.hypot(to.x - from.x, to.y - from.y));
  let remaining = lengths.reduce((total, length) => total + length, 0) * HALF;
  for (const [index, [from, to]] of segments.entries()) {
    const length = lengths[index] ?? 0;
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

function centroidOf(polygon: readonly PlanePoint[]): PlanePoint {
  const sums = ringEdges(polygon).reduce(
    (total, { from, to }) => {
      const cross = from.x * to.y - to.x * from.y;
      return {
        twiceArea: total.twiceArea + cross,
        x: total.x + (from.x + to.x) * cross,
        y: total.y + (from.y + to.y) * cross,
      };
    },
    { twiceArea: 0, x: 0, y: 0 },
  );
  const sixTimesArea = sums.twiceArea * CENTROID_TWICE_AREA_FACTOR;
  if (sixTimesArea === 0) return polygon[0] ?? { x: 0, y: 0 };
  return { x: sums.x / sixTimesArea, y: sums.y / sixTimesArea };
}

/** The middle of the widest inside run along the horizontal line through `y`. */
function widestRunMidpoint(polygon: readonly PlanePoint[], y: number): PlanePoint | undefined {
  const crossings = ringEdges(polygon)
    .filter(({ from, to }) => from.y <= y !== to.y <= y)
    .map(({ from, to }) => from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y))
    .sort((left, right) => left - right);
  const runs = segmentsOf(crossings.map((x) => ({ x, y }))).filter(
    (_, index) => index % CROSSINGS_PER_RUN === 0,
  );
  const widest = runs.reduce<[PlanePoint, PlanePoint] | undefined>(
    (best, run) => (best === undefined || run[1].x - run[0].x > best[1].x - best[0].x ? run : best),
    undefined,
  );
  return widest === undefined ? undefined : { x: (widest[0].x + widest[1].x) * HALF, y };
}

/** The centroid, or a point inside when the centroid falls outside a concave polygon. */
function areaAnchor(polygon: readonly PlanePoint[]): PlanePoint {
  const centroid = centroidOf(polygon);
  if (polygonContains(polygon, centroid)) return centroid;
  return widestRunMidpoint(polygon, centroid.y) ?? polygon[0] ?? centroid;
}

/**
 * Where a comment's chip sits: the item position, the stored tap point, the path midpoint by
 * length, or a point inside the area. Undefined when the element is no longer in the document.
 */
export function anchorPoint(
  document: DesignDocument,
  comment: { readonly elementId: string; readonly surfacePoint?: PlanePoint | undefined },
): PlanePoint | undefined {
  const element = findElement(document, comment.elementId);
  if (element === undefined) return undefined;
  if (element.kind === 'item') return element.item.position;
  if (comment.surfacePoint !== undefined) return comment.surfacePoint;
  if (element.kind === 'path') return pathMidpoint(element.path.points);
  return areaAnchor(element.area.polygon);
}

/**
 * Names an element by catalog name and the ninth of the parcel it sits in, so the CSV and the
 * UI name it the same way. Undefined when the element is gone or is of another kind.
 */
export function elementLabel(
  document: DesignDocument,
  catalog: CatalogIndex,
  target: { readonly ref: ElementRef; readonly parcel: readonly PlanePoint[] },
): ElementLabel | undefined {
  const element = findElement(document, target.ref.elementId);
  if (element?.kind !== target.ref.elementKind) return undefined;
  const entry = entryOf(element, catalog);
  const point = anchorPoint(document, { elementId: target.ref.elementId });
  if (entry === undefined || point === undefined) return undefined;
  return { name: entry.name, zone: compassZoneIn(target.parcel, point) };
}

/** The label as the CSV writes it, such as "Bench, south-west". */
export function formatElementLabel(label: ElementLabel): string {
  return `${label.name}, ${label.zone}`;
}

/**
 * The previous version's comments a new version shows under "On the last version": open,
 * not hidden, and on an element id the new document still has. Any comment shape with those
 * fields works, so the web page can pass the API records it already holds.
 */
export function carriedComments<
  C extends Pick<ElementComment, 'status' | 'hidden'> & { readonly elementId: string },
>(previous: readonly C[], document: DesignDocument): C[] {
  return previous.filter(
    (comment) =>
      comment.status === 'open' &&
      !comment.hidden &&
      findElement(document, comment.elementId) !== undefined,
  );
}
