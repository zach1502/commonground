import { sunPosition, type SunPlacement } from '../components/lighting.js';
import { centreOf, type SceneBounds } from '../geometry/sample.js';
import type { Vector3 } from '../types.js';

const STRAIGHT_ANGLE_DEG = 180;
const DEG_TO_RAD = Math.PI / STRAIGHT_ANGLE_DEG;
const HALF = 0.5;
// The padding is kept on both edges of each axis.
const EDGES = 2;

/**
 * One camera rule for every catalog picture. Each model's bounding sphere fills sphereFill of the
 * frame, so every icon fills its cell as in a city-builder palette; relative size shows in the
 * park, not here. The frame grows past that only when the shadow would reach the padding. The
 * settings go into the thumbnail manifest, so a change here renders every picture again.
 */
export const CATALOG_THUMBNAIL_SETTINGS = {
  sizePx: 256,
  // Front-left three-quarter view: the camera sits 45 degrees left of the model's +z front.
  headingDeg: -45,
  elevationDeg: 30,
  // Lawns, paths and ponds are seen from higher, so they read as surfaces, not slivers.
  flatElevationDeg: 50,
  // A model is flat ground when its height is under this share of its longer side.
  flatHeightShare: 0.15,
  sphereFill: 0.8,
  // Share of the side kept clear on each edge, for the model and its shadow.
  minPadding: 0.04,
  // Higher than the park's 40 degree sun, so a tree's shadow fits the frame; same 110 degree turn.
  sunElevationDeg: 60,
  shadowMapPx: 2048,
} as const;

// Far enough that the near plane never cuts the tallest tree; the view is orthographic, so the
// distance does not change the size.
const CAMERA_DISTANCE_M = 200;

export interface CatalogThumbnailView {
  readonly position: Vector3;
  readonly target: Vector3;
  /** Screen right and up in world space, for tests and for the orthographic frame. */
  readonly right: Vector3;
  readonly up: Vector3;
  /** Half the side of the square orthographic frame, in metres. */
  readonly halfSizeM: number;
  /** Share of the frame side the bounding sphere's diameter fills. */
  readonly fill: number;
  readonly headingRad: number;
  readonly sunElevationRad: number;
  readonly sun: SunPlacement;
  /** Half the side of the sun's shadow camera, enough to cover the model. */
  readonly shadowHalfSideM: number;
}

interface ScreenAxes {
  readonly back: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
}

interface ScreenRect {
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
}

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;

function cornersOf(box: SceneBounds): Vector3[] {
  return [box.minX, box.maxX].flatMap((x) =>
    [box.minY, box.maxY].flatMap((y) => [box.minZ, box.maxZ].map((z) => ({ x, y, z }))),
  );
}

function axesFor(headingRad: number, elevationRad: number): ScreenAxes {
  const ground = Math.cos(elevationRad);
  const back = {
    x: Math.sin(headingRad) * ground,
    y: Math.sin(elevationRad),
    z: Math.cos(headingRad) * ground,
  };
  const right = { x: Math.cos(headingRad), y: 0, z: -Math.sin(headingRad) };
  const up = {
    x: -Math.sin(headingRad) * back.y,
    y: ground,
    z: -Math.cos(headingRad) * back.y,
  };
  return { back, right, up };
}

/** Whether the model is a ground surface such as a lawn, a path or a pond. */
export function isFlatGround(box: SceneBounds): boolean {
  const longer = Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
  return box.maxY - box.minY < longer * CATALOG_THUMBNAIL_SETTINGS.flatHeightShare;
}

/** Where each box corner's shadow lands on the ground under the model. */
function shadowPoints(box: SceneBounds, sun: SunPlacement): Vector3[] {
  const toSun = {
    x: sun.position.x - sun.target.x,
    y: sun.position.y - sun.target.y,
    z: sun.position.z - sun.target.z,
  };
  return cornersOf(box).map((corner) => {
    const along = (corner.y - box.minY) / toSun.y;
    return { x: corner.x - toSun.x * along, y: box.minY, z: corner.z - toSun.z * along };
  });
}

/** The screen rectangle around the sphere's disc and every shadow point. */
function screenRect(axes: ScreenAxes, centre: Vector3, radius: number, shadow: Vector3[]) {
  const us = shadow.map((point) => dot(point, axes.right));
  const vs = shadow.map((point) => dot(point, axes.up));
  const u = dot(centre, axes.right);
  const v = dot(centre, axes.up);
  return {
    minU: Math.min(u - radius, ...us),
    maxU: Math.max(u + radius, ...us),
    minV: Math.min(v - radius, ...vs),
    maxV: Math.max(v + radius, ...vs),
  } satisfies ScreenRect;
}

function halfSideFor(rect: ScreenRect, radius: number): number {
  const { sphereFill, minPadding } = CATALOG_THUMBNAIL_SETTINGS;
  const usable = 1 - EDGES * minPadding;
  const halfWide = (rect.maxU - rect.minU) * HALF;
  const halfTall = (rect.maxV - rect.minV) * HALF;
  return Math.max(radius / sphereFill, halfWide / usable, halfTall / usable);
}

function along(axes: ScreenAxes, u: number, v: number, w: number): Vector3 {
  const { right, up, back } = axes;
  return {
    x: right.x * u + up.x * v + back.x * w,
    y: right.y * u + up.y * v + back.y * w,
    z: right.z * u + up.z * v + back.z * w,
  };
}

/** The orthographic camera and sun for one model, from its bounding box in model space. */
export function catalogThumbnailView(box: SceneBounds): CatalogThumbnailView {
  const settings = CATALOG_THUMBNAIL_SETTINGS;
  const headingRad = settings.headingDeg * DEG_TO_RAD;
  const elevationDeg = isFlatGround(box) ? settings.flatElevationDeg : settings.elevationDeg;
  const axes = axesFor(headingRad, elevationDeg * DEG_TO_RAD);
  const sunElevationRad = settings.sunElevationDeg * DEG_TO_RAD;
  const sun = sunPosition(box, headingRad, sunElevationRad);
  const centre = centreOf(box);
  const radius = Math.hypot(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) * HALF;
  const rect = screenRect(axes, centre, radius, shadowPoints(box, sun));
  const halfSizeM = halfSideFor(rect, radius);
  const target = along(
    axes,
    (rect.minU + rect.maxU) * HALF,
    (rect.minV + rect.maxV) * HALF,
    dot(centre, axes.back),
  );
  return {
    target,
    position: along(
      axes,
      dot(target, axes.right),
      dot(target, axes.up),
      dot(target, axes.back) + CAMERA_DISTANCE_M,
    ),
    right: axes.right,
    up: axes.up,
    halfSizeM,
    fill: radius / halfSizeM,
    headingRad,
    sunElevationRad,
    sun,
    shadowHalfSideM: radius,
  };
}
