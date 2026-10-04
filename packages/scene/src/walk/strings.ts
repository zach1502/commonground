/** Walk text; apps pass it in from their locale files. */
export interface WalkStrings {
  /** The toolbar control that starts a walk, "Walk the park". */
  readonly start: string;
  readonly exit: string;
  readonly next: string;
  /** Turns pointer lock on, so the mouse looks around without a held button. */
  readonly mouseLook: string;
  readonly turnLeft: string;
  readonly turnRight: string;
  /** The toggle button that turns running on and off, as Shift does. */
  readonly run: string;
  /** Accessible name of the focusable walk view. */
  readonly surface: string;
  /** How to move, shown in the view. */
  readonly keys: string;
  /** How to move on a touch screen, shown in place of keys. */
  readonly touchKeys: string;
  /** The walk pad's name. */
  readonly joystick: string;
  /** For example "Entrance {index} of {count}". */
  readonly startAt: string;
  /** For example "Near {label}, {n} m ahead". */
  readonly near: string;
}
