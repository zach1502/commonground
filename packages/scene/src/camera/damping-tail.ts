/** The part of OrbitControls the settler needs: the damping switch and one update step. */
export interface DampedControls {
  enableDamping: boolean;
  update(): unknown;
}

export type SettleStep = 'moving' | 'settled' | 'still';

export interface DampingSettler {
  /** Call on each orbit change event. */
  readonly changed: () => void;
  /** Call once per frame, after the controls update. */
  readonly frame: () => SettleStep;
}

/**
 * OrbitControls stops sending change events once a frame moves the camera less than about 1 mm,
 * but it keeps the rest of the inertia and spends a tenth of it on every later frame. An edit
 * draws a frame, so without this the camera crept a few millimetres on each edit after an orbit.
 * On the first frame with no change, one update with damping off spends the rest at once.
 */
export function createDampingSettler(controls: () => DampedControls | null): DampingSettler {
  let changedThisFrame = false;
  let moving = false;
  return {
    changed: () => {
      changedThisFrame = true;
      moving = true;
    },
    frame: () => {
      if (changedThisFrame) {
        changedThisFrame = false;
        return 'moving';
      }
      if (!moving) return 'still';
      moving = false;
      const current = controls();
      if (current?.enableDamping === true) {
        current.enableDamping = false;
        current.update();
        current.enableDamping = true;
      }
      return 'settled';
    },
  };
}
