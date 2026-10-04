import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode, RefObject } from 'react';

import type { MotionPreference } from '../motion/rise.js';
import { buttonStyle, pressedButtonStyle, toolbarStyle } from '../overlay/styles.js';

import type { WalkStrings } from './strings.js';
import { useWalkAnnouncements } from './use-walk-announcements.js';
import type { WalkLandmark } from './walk-announce.js';
import type { WalkEngine } from './walk-engine.js';
import {
  hintStyle,
  layerStyle,
  liveRegionStyle,
  primaryWalkButtonStyle,
  surfaceStyle,
  touchHintStyle,
} from './walk-styles.js';
import { WalkPad } from './WalkPad.js';

// One CSS pixel of drag or mouse movement turns the view by this much.
const LOOK_RAD_PER_PX = 0.005;
// A pointer that moves less than this between down and up is a tap, not a drag.
const TAP_SLOP_PX = 8;
const NDC_SPAN = 2;

export interface WalkControlsProps {
  readonly engine: WalkEngine;
  readonly strings: WalkStrings;
  readonly motion: MotionPreference;
  /** Items the live region can name when the walker heads toward them. */
  readonly items: readonly WalkLandmark[];
  readonly labels: ReadonlyMap<string, string>;
  readonly onExit: () => void;
  /** Called after any input, so a canvas that draws on demand draws the next frame. */
  readonly onInput?: (() => void) | undefined;
  /** The "you are here" map, drawn in the corner of the view. */
  readonly inset?: ReactNode;
  /** Milliseconds, for pacing the live region; the browser's clock by default. */
  readonly now?: () => number;
}

const COARSE_POINTER = '(pointer: coarse)';

/** 'touch' on a phone or tablet, where the walk pad shows; 'fine' with a mouse. */
function usePointerKind(): 'touch' | 'fine' {
  const [kind] = useState<'touch' | 'fine'>(() =>
    typeof window.matchMedia === 'function' && window.matchMedia(COARSE_POINTER).matches
      ? 'touch'
      : 'fine',
  );
  return kind;
}

function pointerLocked(surface: HTMLElement | null): boolean {
  return surface !== null && document.pointerLockElement === surface;
}

/** Escape anywhere in the walk layer: release the pointer lock first, then leave the walk. */
function escapeHandler(surface: RefObject<HTMLDivElement>, onExit: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (pointerLocked(surface.current)) document.exitPointerLock();
    else onExit();
  };
}

/** Shift turns running on and the next Shift turns it off; a held Shift does not repeat it. */
function useKeyHandlers(engine: WalkEngine) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const repeat = event.repeat ? 'repeat' : 'first';
    if (event.key === 'Shift') {
      if (repeat === 'first') engine.toggleRun();
      return;
    }
    if (engine.press(event.key, { repeat }) === 'handled') event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    engine.release(event.key);
  };
  return {
    onKeyDown,
    onKeyUp,
    onBlur: () => {
      engine.releaseAll();
    },
  };
}

interface Press {
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  dragged: 'tap' | 'drag';
}

/** Drag looks around, as if holding the scene; a tap asks to walk to that point. */
function usePointerHandlers(engine: WalkEngine) {
  const press = useRef<Press | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerLocked(event.currentTarget)) return;
    const { clientX: x, clientY: y } = event;
    press.current = { startX: x, startY: y, lastX: x, lastY: y, dragged: 'tap' };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerLocked(event.currentTarget)) {
      engine.look(-event.movementX * LOOK_RAD_PER_PX, -event.movementY * LOOK_RAD_PER_PX);
      return;
    }
    const current = press.current;
    if (current === null) return;
    const far = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    if (far > TAP_SLOP_PX) current.dragged = 'drag';
    if (current.dragged === 'tap') return;
    const dx = event.clientX - current.lastX;
    const dy = event.clientY - current.lastY;
    current.lastX = event.clientX;
    current.lastY = event.clientY;
    engine.look(dx * LOOK_RAD_PER_PX, dy * LOOK_RAD_PER_PX);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    press.current = null;
    if (current?.dragged !== 'tap') return;
    const box = event.currentTarget.getBoundingClientRect();
    engine.requestTap({
      x: ((event.clientX - box.left) / Math.max(box.width, 1)) * NDC_SPAN - 1,
      y: 1 - ((event.clientY - box.top) / Math.max(box.height, 1)) * NDC_SPAN,
    });
  };
  const onPointerCancel = () => {
    press.current = null;
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

interface WalkToolbarProps {
  readonly engine: WalkEngine;
  readonly strings: WalkStrings;
  readonly onExit: () => void;
  readonly surface: RefObject<HTMLDivElement>;
}

function usePace(engine: WalkEngine): ReturnType<WalkEngine['pace']> {
  return useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.pace(),
  );
}

interface RunToggleProps {
  readonly engine: WalkEngine;
  readonly label: string;
  /** Takes the keys back after a press, so the walk carries on. */
  readonly surface: RefObject<HTMLDivElement>;
}

/** Run: pressed while running is on, the same toggle as Shift, so a tap works on touch. */
function RunToggle({ engine, label, surface }: RunToggleProps): ReactElement {
  const running = usePace(engine) === 'run';
  return (
    <button
      type="button"
      style={running ? pressedButtonStyle : buttonStyle}
      aria-pressed={running}
      onClick={() => {
        engine.toggleRun();
        surface.current?.focus();
      }}
    >
      {label}
    </button>
  );
}

/** Back to overview, Next entrance, the turn buttons, Run and Mouse look. */
function WalkToolbar({ engine, strings, onExit, surface }: WalkToolbarProps): ReactElement {
  // After a turn, a jump or Run, the keys go back to the view so the walk carries on.
  const then = (action: () => void) => () => {
    action();
    surface.current?.focus();
  };
  return (
    <div style={toolbarStyle} role="group" aria-label={strings.start}>
      <button type="button" style={primaryWalkButtonStyle} onClick={onExit}>
        {strings.exit}
      </button>
      {engine.startCount() > 1 ? (
        <button
          type="button"
          style={buttonStyle}
          onClick={then(() => {
            engine.next();
          })}
        >
          {strings.next}
        </button>
      ) : null}
      <button
        type="button"
        style={buttonStyle}
        onClick={then(() => {
          engine.turn('left');
        })}
      >
        {strings.turnLeft}
      </button>
      <button
        type="button"
        style={buttonStyle}
        onClick={then(() => {
          engine.turn('right');
        })}
      >
        {strings.turnRight}
      </button>
      <RunToggle engine={engine} label={strings.run} surface={surface} />
      <button
        type="button"
        style={buttonStyle}
        onClick={() => void surface.current?.requestPointerLock()}
      >
        {strings.mouseLook}
      </button>
    </div>
  );
}

/**
 * The walk's input layer over the canvas: keys while the view has focus, drag to look, tap to
 * walk, the walk pad on a touch screen, and the buttons that do the same without a drag.
 * Pointer lock stays off until the person presses Mouse look.
 */
export function WalkControls(props: WalkControlsProps): ReactElement {
  const { engine, strings, onInput } = props;
  const surface = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const line = useWalkAnnouncements(props);
  useEffect(() => {
    surface.current?.focus();
  }, []);
  // Running ends with the walk, so the next walk starts at walking pace.
  useEffect(
    () => () => {
      engine.setPace('walk');
    },
    [engine],
  );
  const onExit = () => {
    engine.setPace('walk');
    props.onExit();
  };
  useEffect(
    () => (onInput === undefined ? undefined : engine.subscribe(onInput)),
    [engine, onInput],
  );
  const keys = useKeyHandlers(engine);
  const pointer = usePointerHandlers(engine);
  const pointerKind = usePointerKind();
  const touch = pointerKind === 'touch';
  return (
    <div style={layerStyle} onKeyDown={escapeHandler(surface, onExit)}>
      <div
        ref={surface}
        role="application"
        aria-label={strings.surface}
        aria-describedby={hintId}
        tabIndex={0}
        style={surfaceStyle}
        {...keys}
        {...pointer}
      />
      <WalkToolbar engine={engine} strings={strings} onExit={onExit} surface={surface} />
      <p id={hintId} style={touch ? touchHintStyle : hintStyle}>
        {touch ? strings.touchKeys : strings.keys}
      </p>
      {touch ? <WalkPad engine={engine} label={strings.joystick} /> : null}
      {props.inset}
      <p role="status" style={liveRegionStyle}>
        {line}
      </p>
    </div>
  );
}
