import { centreOf } from '../geometry/sample.js';
import type { SceneBounds } from '../geometry/sample.js';
import type { ScenePalette } from '../palette/colours.js';
import type { RenderFeatures, RenderProfile } from '../perf/render-tier.js';
import type { Vector3 } from '../types.js';

const STRAIGHT_ANGLE_DEG = 180;
const DEG_TO_RAD = Math.PI / STRAIGHT_ANGLE_DEG;
// DESIGN.md "Light": 40 degrees up, 100 to 120 degrees around from the reset heading.
const SUN_ELEVATION_DEG = 40;
const SUN_TURN_DEG = 110;
const SUN_ELEVATION_RAD = SUN_ELEVATION_DEG * DEG_TO_RAD;
const SUN_TURN_RAD = SUN_TURN_DEG * DEG_TO_RAD;
// Far enough to clear the tallest tree, near enough to stay inside the shadow camera's far plane.
const SUN_DISTANCE_M = 160;
const SUN_COLOUR = '#fff1dc';
const SUN_INTENSITY = 2.8;
const HEMISPHERE_INTENSITY = 0.75;
// DESIGN.md: with the generated environment on, the hemisphere drops and the ambient goes.
const HEMISPHERE_WITH_ENVIRONMENT = 0.3;
// Keeps dark trunks off pure black on the side away from the sun when there is no environment.
const AMBIENT_INTENSITY = 0.12;
// DESIGN.md "Light" and "Sky and fog": exposure 0.9 to 1.1 and fog density 0.0015.
const PHONE_TONE: SceneTone = { exposure: 1, fogDensity: 0.0015 };
// With the composer on, three.js fogs the linear colour before ACES instead of the display
// colour after it, which lifts the darks toward the sky. Thinner fog and a touch more exposure
// make the desktop tier read like the phone tier; tuned side by side on ?park=seed.
const COMPOSER_TONE: SceneTone = { exposure: 1.1, fogDensity: 0.0008 };

/** Tone mapping exposure and fog density; they differ by where the tier tone maps. */
export interface SceneTone {
  readonly exposure: number;
  readonly fogDensity: number;
}

export function sceneTone(features: RenderFeatures): SceneTone {
  return features.composer === 'on' ? COMPOSER_TONE : PHONE_TONE;
}

export interface SunPlacement {
  readonly position: Vector3;
  readonly target: Vector3;
}

/**
 * The sun's position, turned from the reset view heading and aimed at the parcel centre. The
 * catalog pictures pass a higher elevation, so a tall model's shadow fits its frame.
 */
export function sunPosition(
  bounds: SceneBounds,
  resetHeadingRad: number,
  elevationRad = SUN_ELEVATION_RAD,
): SunPlacement {
  const target = centreOf(bounds);
  const heading = resetHeadingRad + SUN_TURN_RAD;
  const ground = SUN_DISTANCE_M * Math.cos(elevationRad);
  return {
    target,
    position: {
      x: target.x + ground * Math.sin(heading),
      y: target.y + SUN_DISTANCE_M * Math.sin(elevationRad),
      z: target.z + ground * Math.cos(heading),
    },
  };
}

export interface LightRig {
  readonly sun: { readonly colour: string; readonly intensity: number };
  readonly hemisphere: {
    readonly sky: string;
    readonly ground: string;
    readonly intensity: number;
  };
  readonly ambient: number;
  /** Colours of the two generated Lightformer planes, when the environment is on. */
  readonly environment?: { readonly sky: string; readonly ground: string };
}

/**
 * 'environment' adds sky and ground fill from a generated environment map, which downloads
 * nothing; 'lights' is the cheaper fill from the hemisphere and ambient lights alone.
 */
export type FillLight = 'environment' | 'lights';

/** Light colours and strengths; the palette gives the sky and the ground bounce. */
export function lightRig(palette: ScenePalette, fill: FillLight): LightRig {
  const sun = { colour: SUN_COLOUR, intensity: SUN_INTENSITY };
  const hemisphere = { sky: palette.sky, ground: palette.soilDark };
  if (fill === 'environment') {
    return {
      sun,
      hemisphere: { ...hemisphere, intensity: HEMISPHERE_WITH_ENVIRONMENT },
      ambient: 0,
      environment: { sky: palette.sky, ground: palette.soilDark },
    };
  }
  return {
    sun,
    hemisphere: { ...hemisphere, intensity: HEMISPHERE_INTENSITY },
    ambient: AMBIENT_INTENSITY,
  };
}

/** The environment pass is skipped under a major caveat, where each render-to-texture is slow. */
export function fillFor(profile: RenderProfile): FillLight {
  return profile.caveat === 'major' ? 'lights' : 'environment';
}
