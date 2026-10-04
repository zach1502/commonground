import type { WalkProbe, WalkProps, WalkStrings } from '../src/index.js';

import type { DevScene } from './park-source.js';

declare global {
  interface Window {
    /** The walk camera and the ground under it, from the last walk frame. */
    __parkshapeWalk: WalkProbe | null;
    __parkshapeWalkMode: 'walk' | 'overview';
    /** The parcel the walk stays inside, in the ground frame. */
    __parkshapeWalkParcel: readonly { readonly x: number; readonly z: number }[];
  }
}

// Apps pass these from their locale files; the dev page writes them out.
const walkStrings: WalkStrings = {
  start: 'Walk the park',
  exit: 'Back to overview',
  next: 'Next entrance',
  mouseLook: 'Mouse look',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  run: 'Run',
  surface: 'Walk view',
  keys: 'Arrow keys or W, A, S and D walk. Shift or Run turns running on and off. Drag to look around.',
  startAt: 'Entrance {index} of {count}',
  near: 'Near {label}, {n} m ahead',
  touchKeys: 'Drag the round pad to walk. Tap Run to go faster. Drag the view to look around.',
  joystick: 'Walk pad',
};

window.__parkshapeWalk = null;
window.__parkshapeWalkMode = 'overview';

/** The walk on the dev page, with its probe on window for the scene checks. */
export function devWalk(scene: DevScene): WalkProps {
  window.__parkshapeWalkParcel = scene.parcel;
  return {
    parcel: scene.parcel,
    strings: walkStrings,
    onModeChange: (mode) => {
      window.__parkshapeWalkMode = mode;
    },
    onPose: (probe) => {
      window.__parkshapeWalk = probe;
    },
  };
}
