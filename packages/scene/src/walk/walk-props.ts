import type { GroundPoint } from '../types.js';

import type { WalkStrings } from './strings.js';
import type { WalkProbe } from './WalkCamera.js';

/** The park walk on the viewer, at eye height from the design's entrances. */
export interface WalkProps {
  /** The parcel boundary in the scene's ground frame; the walker stays inside it. */
  readonly parcel: readonly GroundPoint[];
  readonly strings: WalkStrings;
  /** Names of items by id, such as "Bench, south-west", for the "Near ..." line. */
  readonly labels?: ReadonlyMap<string, string> | undefined;
  /**
   * 'toolbar' (the default) puts "Walk the park" in the viewer toolbar. 'on-ready' starts the
   * walk once the scene has drawn, for a page that has its own control to start it.
   */
  readonly start?: 'toolbar' | 'on-ready' | undefined;
  /** Called when the person starts a walk or goes back to the overview. */
  readonly onModeChange?: ((mode: 'walk' | 'overview') => void) | undefined;
  /** Test hook for the dev page: the camera and the ground under it on each walk frame. */
  readonly onPose?: ((probe: WalkProbe) => void) | undefined;
}
