import type { SceneBounds } from '../geometry/sample.js';
import { ISLAND_SKIRT_DEPTH_M } from '../geometry/terrain-mesh.js';
import type { Vector3 } from '../types.js';

import { fitPose } from './fit.js';

/** Just off the zenith, so orbit controls keep a stable heading when looking straight down. */
export const MIN_POLAR_ANGLE_RAD = 0.01;
/** About 80 degrees from vertical, which keeps the camera above the horizon and the ground. */
export const MAX_POLAR_ANGLE_RAD = 1.4;

export const PRESET_NAMES = ['reset', 'top-down', 'birds-eye'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface CameraPose {
  readonly position: Vector3;
  readonly target: Vector3;
}

interface PresetShape {
  readonly polar: number;
  /** Heading measured from +z (south) toward +x (east). */
  readonly azimuth: number;
}

/** DESIGN.md "Framing": the field of view every scene camera uses. */
export const FIELD_OF_VIEW_DEG = 38;
/** Width over height assumed before the canvas has measured itself. */
export const DEFAULT_ASPECT = 1.6;

const HALF = 0.5;
const SOUTH_EAST = Math.PI * HALF * HALF;
/** Heading of the reset view from +z (south) toward +x (east); the sun is placed from it. */
export const RESET_HEADING_RAD = SOUTH_EAST;

// DESIGN.md: the reset view looks down 30 to 35 degrees; 32 below the horizon.
const RESET_PITCH_DEG = 32;
const STRAIGHT_ANGLE_DEG = 180;
const RESET_PITCH_RAD = (RESET_PITCH_DEG * Math.PI) / STRAIGHT_ANGLE_DEG;
const QUARTER_TURN = Math.PI * HALF;

const SHAPES: Readonly<Record<PresetName, PresetShape>> = {
  reset: { polar: QUARTER_TURN - RESET_PITCH_RAD, azimuth: RESET_HEADING_RAD },
  'top-down': { polar: MIN_POLAR_ANGLE_RAD, azimuth: 0 },
  'birds-eye': { polar: 0.6, azimuth: 0 },
};

export function clampPolarAngle(angle: number): number {
  return Math.min(Math.max(angle, MIN_POLAR_ANGLE_RAD), MAX_POLAR_ANGLE_RAD);
}

/** Camera angle from straight up, as orbit controls measure it. */
export function polarAngleOf(pose: CameraPose): number {
  const dx = pose.position.x - pose.target.x;
  const dy = pose.position.y - pose.target.y;
  const dz = pose.position.z - pose.target.z;
  return Math.acos(dy / Math.hypot(dx, dy, dz));
}

function directionOf(shape: PresetShape): Vector3 {
  const polar = clampPolarAngle(shape.polar);
  return {
    x: Math.sin(polar) * Math.sin(shape.azimuth),
    y: Math.cos(polar),
    z: Math.sin(polar) * Math.cos(shape.azimuth),
  };
}

/**
 * Camera pose for a named view of the parcel, aimed at its centre and moved back until every
 * corner of the parcel box sits inside the frame margin. The viewer, editor, thumbnail and
 * heatmap all frame through this one function.
 */
export function cameraPreset(
  name: PresetName,
  bounds: SceneBounds,
  aspect: number = DEFAULT_ASPECT,
): CameraPose {
  const direction = directionOf(SHAPES[name]);
  // The island's skirt hangs below the lowest ground, and it has to fit in the frame too.
  const island = { ...bounds, minY: bounds.minY - ISLAND_SKIRT_DEPTH_M };
  return fitPose(island, direction, { fovDeg: FIELD_OF_VIEW_DEG, aspect });
}

/** How close the framed view sits, as a multiple of the parcel diagonal. Nearer than any preset. */
const FRAME_REACH = 0.45;

/**
 * Camera pose that looks at one point, for the meters' "Show me" action. It uses the bird's eye
 * pitch and heading so the problem sits centred and above the horizon, closer than the presets.
 */
export function frameOn(focus: Vector3, bounds: SceneBounds): CameraPose {
  const shape = SHAPES['birds-eye'];
  const distance = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * FRAME_REACH;
  const polar = clampPolarAngle(shape.polar);
  const ground = distance * Math.sin(polar);
  return {
    target: focus,
    position: {
      x: focus.x + ground * Math.sin(shape.azimuth),
      y: focus.y + distance * Math.cos(polar),
      z: focus.z + ground * Math.cos(shape.azimuth),
    },
  };
}
