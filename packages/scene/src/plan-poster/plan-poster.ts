import {
  catalogIndex,
  fillsItsBox,
  type DesignArea,
  type DesignDocument,
  type DesignItem,
  type DesignPath,
  type Parcel,
} from '@parkshape/core';

import type { ScenePalette } from '../palette/colours.js';

/** The same frame as a stored thumbnail, so the poster slot keeps one size for both. */
export const PLAN_POSTER_WIDTH = 640;
export const PLAN_POSTER_HEIGHT = 400;

// Metres of margin around the parcel, so edge items are not cut off.
const MARGIN_M = 4;
// A tree with no mature crown in the catalog, and any other point item, drawn as a dot this wide.
const TREE_RADIUS_M = 3;
const ITEM_RADIUS_M = 1;
const DECIMALS = 2;
// The margin sits on both sides of the parcel.
const SIDES = 2;
const DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';

export interface PlanPosterInput {
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  readonly palette: ScenePalette;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function num(value: number): string {
  return String(Number(value.toFixed(DECIMALS)) + 0);
}

/** SVG y grows downward; flipping it keeps north at the top of the picture. */
function flipY(y: number): number {
  return 0 - y;
}

function pointList(points: readonly Point[]): string {
  return points.map((point) => `${num(point.x)},${num(flipY(point.y))}`).join(' ');
}

function viewBox(parcel: Parcel): string {
  const xs = parcel.polygon.map((point) => point.x);
  const ys = parcel.polygon.map((point) => flipY(point.y));
  const left = Math.min(...xs) - MARGIN_M;
  const top = Math.min(...ys) - MARGIN_M;
  const width = Math.max(...xs) - Math.min(...xs) + MARGIN_M * SIDES;
  const height = Math.max(...ys) - Math.min(...ys) + MARGIN_M * SIDES;
  return [left, top, width, height].map(num).join(' ');
}

function areaFill(area: DesignArea, palette: ScenePalette): string {
  const item = catalogIndex.get(area.catalogId);
  if (item?.surface === 'water') return palette.water;
  if (item?.surface === 'impervious') return palette.pathSurface;
  return item?.category === 'garden' ? palette.soil : palette.terrainMeadow;
}

function areaShape(area: DesignArea, palette: ScenePalette): string {
  return `<polygon points="${pointList(area.polygon)}" fill="${areaFill(area, palette)}"/>`;
}

function pathShape(path: DesignPath, palette: ScenePalette): string {
  const stroke = `stroke="${palette.pathSurface}" stroke-width="${num(path.widthM)}"`;
  return `<polyline points="${pointList(path.points)}" fill="none" ${stroke} stroke-linecap="round" stroke-linejoin="round"/>`;
}

function itemShape(item: DesignItem, palette: ScenePalette): string {
  const entry = catalogIndex.get(item.catalogId);
  const category = entry?.category;
  const green = category === 'tree' || category === 'shrub';
  const radius = green ? (entry?.crownRadiusMatureM ?? TREE_RADIUS_M) : ITEM_RADIUS_M;
  const fill = green ? palette.success : palette.info;
  const { x, y } = item.position;
  return `<circle cx="${num(x)}" cy="${num(flipY(y))}" r="${num(radius)}" fill="${fill}"/>`;
}

/**
 * A flat top-down plan of a design, as SVG markup. It stands in for the 3D render until a
 * thumbnail exists, and it needs no WebGL, so it can paint as soon as the design arrives. The
 * design is masked to the parcel outline, so a crown or path end never shows past its edge.
 */
export function planPosterSvg({ document, parcel, palette }: PlanPosterInput): string {
  const ground = `<polygon id="parcel" points="${pointList(parcel.polygon)}" fill="${palette.terrainGrass}"/>`;
  const mask = '<defs><clipPath id="parcel-clip"><use href="#parcel"/></clipPath></defs>';
  const shapes = [
    ...document.areas.map((area) => areaShape(area, palette)),
    ...document.paths.map((path) => pathShape(path, palette)),
    ...document.items.map((item) => itemShape(item, palette)),
  ];
  const size = `width="${String(PLAN_POSTER_WIDTH)}" height="${String(PLAN_POSTER_HEIGHT)}"`;
  // A parcel that fills its box keeps the unmasked drawing it always had.
  const design = fillsItsBox(parcel.polygon)
    ? shapes.join('')
    : `${mask}<g clip-path="url(#parcel-clip)">${shapes.join('')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${viewBox(parcel)}">${ground}${design}</svg>`;
}

/** The plan as a data URL, for an image tag with a fixed width and height. */
export function planPosterUrl(input: PlanPosterInput): string {
  return DATA_URL_PREFIX + encodeURIComponent(planPosterSvg(input));
}
