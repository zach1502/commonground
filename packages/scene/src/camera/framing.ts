import type { SceneBounds } from '../geometry/sample.js';

/** What the preset framing of the camera depends on. */
export interface Framing {
  readonly bounds: SceneBounds;
  readonly aspect: number;
  /** Grows on each preset click, so the same preset can repeat. */
  readonly request: number;
}

/** 'framed' while the camera sits on a preset; 'moved' once the person orbits, pans or zooms. */
export type CameraHold = 'framed' | 'moved';

/** 'place' puts the camera on the preset at once, 'fly' eases there, 'hold' leaves it alone. */
export type Reframe = 'place' | 'fly' | 'hold';

export function framingOf(framing: Framing): Framing {
  return framing;
}

/** Same parcel on the ground. Heights are left out, so a terraform stroke is not a new parcel. */
function sameParcel(a: SceneBounds, b: SceneBounds): boolean {
  return a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
}

/**
 * Whether the camera moves to its preset. Every edit rebuilds the scene and hands down new bounds
 * with the same values, so the camera only moves for a preset click, a different parcel, or a
 * resize while the person has not yet moved the camera themselves.
 */
export function reframeFor(input: {
  readonly shown: Framing | null;
  readonly next: Framing;
  readonly camera: CameraHold;
}): Reframe {
  const { shown, next, camera } = input;
  if (shown === null) return 'place';
  if (next.request !== shown.request) return 'fly';
  if (!sameParcel(shown.bounds, next.bounds)) return 'place';
  if (next.aspect !== shown.aspect && camera === 'framed') return 'place';
  return 'hold';
}
