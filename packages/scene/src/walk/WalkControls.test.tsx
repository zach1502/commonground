// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';
import type { MotionPreference } from '../motion/rise.js';

import type { WalkStrings } from './strings.js';
import { WalkEngine } from './walk-engine.js';
import type { WalkStart } from './walk-starts.js';
import { WalkControls } from './WalkControls.js';

const strings: WalkStrings = {
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
const world = {
  heightmap: heightmapFrom({ width: 61, height: 61, resolutionM: 1 }, () => 5),
  parcel: [
    { x: 0, z: 0 },
    { x: 60, z: 0 },
    { x: 60, z: 60 },
    { x: 0, z: 60 },
  ],
};
const starts: WalkStart[] = [
  { position: { x: 30, z: 2 }, headingRad: 0, kind: 'entrance' },
  { position: { x: 30, z: 58 }, headingRad: Math.PI, kind: 'entrance' },
];
const bench = { id: 'bench-1', position: { x: 30, z: 8 } };
const FPS = 60;

beforeAll(() => {
  // jsdom has no PointerEvent; a MouseEvent subclass carries the pointer type and position.
  class TestPointerEvent extends MouseEvent {
    readonly pointerType: string;
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
});
afterEach(cleanup);

interface Setup {
  readonly motion?: MotionPreference;
  readonly starts?: readonly WalkStart[];
  readonly now?: () => number;
}

function setup({ motion = 'full', starts: given = starts, now = () => 0 }: Setup = {}) {
  const engine = new WalkEngine({ world, starts: given, motion });
  const onExit = vi.fn();
  const { container } = render(
    <WalkControls
      engine={engine}
      strings={strings}
      motion={motion}
      items={[bench]}
      labels={new Map([['bench-1', 'Bench, south']])}
      onExit={onExit}
      now={now}
    />,
  );
  const surface = screen.getByRole('application', { name: strings.surface });
  return { engine, onExit, surface, container };
}

/** Says the screen is touch first, as a phone's matchMedia does. */
function coarsePointer(pointer: 'touch' | 'fine'): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: pointer === 'touch' && query === '(pointer: coarse)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

const PAD_RADIUS_PX = 48;

/** Pushes the walk pad to its top rim, straight forward. */
function pushPadForward(container: HTMLElement): HTMLElement {
  const pad = container.querySelector('[data-walk-pad]');
  if (!(pad instanceof HTMLElement)) throw new Error('no walk pad');
  pad.getBoundingClientRect = () => new DOMRect(0, 0, PAD_RADIUS_PX * 2, PAD_RADIUS_PX * 2);
  fireEvent.pointerDown(pad, { pointerType: 'touch', clientX: 48, clientY: 48 });
  fireEvent.pointerMove(pad, { pointerType: 'touch', clientX: 48, clientY: 0 });
  return pad;
}

function advanceFor(engine: WalkEngine, seconds: number): void {
  act(() => {
    for (let frame = 0; frame < seconds * FPS; frame += 1) engine.advance(1 / FPS);
  });
}

describe('WalkControls', () => {
  it('takes focus on the walk view when the walk starts', () => {
    const { surface } = setup();
    expect(document.activeElement).toBe(surface);
  });

  it('walks while an arrow key is held and stops on release', () => {
    const { engine, surface } = setup();
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
    fireEvent.keyUp(surface, { key: 'ArrowUp' });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
  });

  it('turns running on with one Shift press, keeping it after Shift is let go', () => {
    const { engine, surface } = setup();
    fireEvent.keyDown(surface, { key: 'Shift' });
    fireEvent.keyUp(surface, { key: 'Shift' });
    fireEvent.keyDown(surface, { key: 'W' });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(6.375, 3);
  });

  it('goes back to walking speed on a second Shift press', () => {
    const { engine, surface } = setup();
    fireEvent.keyDown(surface, { key: 'Shift' });
    fireEvent.keyUp(surface, { key: 'Shift' });
    fireEvent.keyDown(surface, { key: 'Shift' });
    fireEvent.keyDown(surface, { key: 'W' });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
  });

  it('ignores the key repeat of a held Shift', () => {
    const { engine, surface } = setup();
    fireEvent.keyDown(surface, { key: 'Shift' });
    fireEvent.keyDown(surface, { key: 'Shift', repeat: true });
    expect(engine.pace()).toBe('run');
  });
});

describe('WalkControls Run toggle', () => {
  it('shows the running state on the Run button through aria-pressed', () => {
    const { surface } = setup();
    const run = screen.getByRole('button', { name: strings.run });
    expect(run.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(surface, { key: 'Shift' });
    expect(run.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(run);
    expect(run.getAttribute('aria-pressed')).toBe('false');
  });

  it('turns running off when the walk ends', () => {
    const { engine, surface, onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: strings.run }));
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect([onExit.mock.calls.length, engine.pace()]).toEqual([1, 'walk']);
  });

  it('turns running off when the controls close', () => {
    const { engine, surface } = setup();
    fireEvent.keyDown(surface, { key: 'Shift' });
    cleanup();
    expect(engine.pace()).toBe('walk');
  });
});

describe('WalkControls exits', () => {
  it('goes back to the overview on Escape and on Back to overview', () => {
    const { onExit, surface } = setup();
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: strings.exit }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('releases the pointer lock on the first Escape and leaves on the second', () => {
    const { onExit, surface } = setup();
    const exitPointerLock = vi.fn(() => {
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    });
    Object.defineProperty(document, 'exitPointerLock', {
      value: exitPointerLock,
      configurable: true,
    });
    Object.defineProperty(document, 'pointerLockElement', { value: surface, configurable: true });
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('asks for pointer lock only when the person presses Mouse look', () => {
    const { surface } = setup();
    const requestPointerLock = vi.fn();
    Object.defineProperty(surface, 'requestPointerLock', { value: requestPointerLock });
    expect(requestPointerLock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: strings.mouseLook }));
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
  });
});

describe('WalkControls pointer', () => {
  it('turns the view by a touch drag without walking', () => {
    const { engine, surface } = setup();
    fireEvent.pointerDown(surface, { pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerType: 'touch', clientX: 160, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerType: 'touch', clientX: 160, clientY: 100 });
    expect(engine.state().headingRad).not.toBeCloseTo(0, 3);
    expect(engine.takeTap()).toBeUndefined();
    expect(engine.state().position).toEqual(starts[0]?.position);
  });

  it('turns a touch tap into a walk request at that point of the view', () => {
    const { engine, surface } = setup();
    surface.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
    fireEvent.pointerDown(surface, { pointerType: 'touch', clientX: 150, clientY: 25 });
    fireEvent.pointerUp(surface, { pointerType: 'touch', clientX: 151, clientY: 25 });
    const tap = engine.takeTap();
    expect(tap?.x).toBeCloseTo(0.51, 2);
    expect(tap?.y).toBeCloseTo(0.5, 2);
  });
});

describe('WalkControls buttons and reduced motion', () => {
  it('turns 45 degrees per press of Turn left and Turn right', () => {
    const { engine } = setup();
    fireEvent.click(screen.getByRole('button', { name: strings.turnLeft }));
    expect(engine.state().headingRad).toBeCloseTo(Math.PI / 4, 6);
    fireEvent.click(screen.getByRole('button', { name: strings.turnRight }));
    expect(engine.state().headingRad).toBeCloseTo(0, 6);
  });

  it('moves in whole 4 m steps under reduced motion', () => {
    const { engine, surface } = setup({ motion: 'reduced' });
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    expect(engine.state().position.z).toBeCloseTo(6, 6);
    fireEvent.keyDown(surface, { key: 'ArrowUp', repeat: true });
    expect(engine.state().position.z).toBeCloseTo(6, 6);
  });

  it('teleports to the next entrance and names it', () => {
    const { engine } = setup({ motion: 'reduced' });
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Entrance 1 of 2');
    fireEvent.click(screen.getByRole('button', { name: strings.next }));
    expect(engine.state().position).toEqual(starts[1]?.position);
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Entrance 2 of 2');
  });

  it('hides Next entrance when the walk has one start', () => {
    setup({ starts: starts.slice(0, 1) });
    expect(screen.queryByRole('button', { name: strings.next })).toBeNull();
  });

  it('names the labelled item ahead, at most once a second', () => {
    let nowMs = 0;
    const { engine, surface } = setup({ now: () => nowMs });
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    nowMs = 500;
    advanceFor(engine, 0.1);
    expect(screen.getByRole('status').textContent).toBe('Entrance 1 of 2');
    nowMs = 1500;
    advanceFor(engine, 0.1);
    expect(screen.getByRole('status').textContent).toBe('Near Bench, south, 6 m ahead');
  });
});

describe('WalkControls walk pad', () => {
  afterEach(() => {
    coarsePointer('fine');
  });

  it('shows the walk pad and the touch hint on a touch screen', () => {
    coarsePointer('touch');
    const { container } = setup();
    expect(container.querySelector('[data-walk-pad]')).not.toBeNull();
    expect(screen.getByText(strings.touchKeys)).toBeTruthy();
  });

  it('has no walk pad with a mouse and keyboard', () => {
    coarsePointer('fine');
    const { container } = setup();
    expect(container.querySelector('[data-walk-pad]')).toBeNull();
    expect(screen.getByText(strings.keys)).toBeTruthy();
  });

  it('runs on the walk pad after a tap on Run', () => {
    coarsePointer('touch');
    const { engine, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: strings.run }));
    pushPadForward(container);
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(6.375, 3);
  });

  it('walks while the pad is pushed forward and stops when it is let go', () => {
    coarsePointer('touch');
    const { engine, container } = setup();
    const pad = pushPadForward(container);
    expect(engine.live()).toBe('live');
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
    fireEvent.pointerUp(pad, { pointerType: 'touch', clientX: 48, clientY: 0 });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
    expect(engine.live()).toBe('idle');
  });

  it('takes one 4 m step per push under reduced motion', () => {
    coarsePointer('touch');
    const { engine, container } = setup({ motion: 'reduced' });
    const pad = container.querySelector('[data-walk-pad]');
    if (!(pad instanceof HTMLElement)) throw new Error('no walk pad');
    pad.getBoundingClientRect = () => new DOMRect(0, 0, PAD_RADIUS_PX * 2, PAD_RADIUS_PX * 2);
    fireEvent.pointerDown(pad, { pointerType: 'touch', clientX: 48, clientY: 48 });
    fireEvent.pointerMove(pad, { pointerType: 'touch', clientX: 48, clientY: 0 });
    fireEvent.pointerMove(pad, { pointerType: 'touch', clientX: 50, clientY: 2 });
    expect(engine.state().position.z).toBeCloseTo(6, 6);
    fireEvent.pointerUp(pad, { pointerType: 'touch', clientX: 48, clientY: 0 });
    expect(engine.state().position.z).toBeCloseTo(6, 6);
  });
});
