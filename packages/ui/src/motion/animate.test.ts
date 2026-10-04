import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  crossfade,
  drawCheck,
  enter,
  exit,
  fadeIn,
  flip,
  MOTION_EASING,
  MOTION_MS,
  motionPreference,
} from './index.js';

interface Call {
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

let calls: Call[] = [];

function fakeAnimate(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  calls.push({ keyframes, options });
  return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
}

function setReduced(reduce: 'reduce' | 'no-preference') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce === 'reduce' && query.includes('reduce') })),
  );
}

beforeEach(() => {
  calls = [];
  Element.prototype.animate = fakeAnimate;
  setReduced('no-preference');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('motionPreference', () => {
  it('reads prefers-reduced-motion', () => {
    expect(motionPreference()).toBe('full');
    setReduced('reduce');
    expect(motionPreference()).toBe('reduced');
  });
});

describe('enter', () => {
  it('fades and rises 8 px over 250 ms on the entry curve', async () => {
    const node = document.createElement('div');
    await enter(node, { offset: { axis: 'y', px: 8 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes).toEqual([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(calls[0]?.options).toMatchObject({
      duration: MOTION_MS.medium,
      easing: MOTION_EASING.entry,
    });
  });

  it('does not animate under reduced motion and resolves at once', async () => {
    setReduced('reduce');
    await enter(document.createElement('div'), { offset: { axis: 'x', px: 16 } });
    expect(calls).toHaveLength(0);
  });

  it('resolves at once where the browser has no Web Animations', async () => {
    const node = document.createElement('div');
    Object.defineProperty(node, 'animate', { value: undefined });
    await expect(enter(node, {})).resolves.toBeUndefined();
  });
});

describe('exit', () => {
  it('fades out over 150 ms on the exit curve and holds the end frame', async () => {
    await exit(document.createElement('div'), { offset: { axis: 'x', px: -16 } });
    expect(calls[0]?.keyframes).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(-16px)' },
    ]);
    expect(calls[0]?.options).toMatchObject({
      duration: MOTION_MS.small,
      easing: MOTION_EASING.exit,
      fill: 'forwards',
    });
  });

  it('is never longer than its entry', async () => {
    const node = document.createElement('div');
    await enter(node, {});
    await exit(node, {});
    expect(calls[1]?.options.duration).toBeLessThanOrEqual(Number(calls[0]?.options.duration));
  });
});

describe('fadeIn', () => {
  it('runs one 150 ms opacity reveal with no delay', async () => {
    await fadeIn(document.createElement('ul'));
    expect(calls).toEqual([
      {
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        options: { duration: MOTION_MS.small, easing: MOTION_EASING.entry, delay: 0 },
      },
    ]);
  });
});

describe('flip', () => {
  it('slides only the rows that moved, over 250 ms on the move curve', () => {
    const rows = [0, 1, 2].map(() => document.createElement('tr'));
    const count = flip(rows.map((element, index) => ({ element, fromPx: index === 1 ? 0 : 40 })));
    expect(count).toBe(2);
    expect(calls.map((call) => call.keyframes[0])).toEqual([
      { transform: 'translateY(40px)' },
      { transform: 'translateY(40px)' },
    ]);
    expect(calls[0]?.options).toMatchObject({
      duration: MOTION_MS.medium,
      easing: MOTION_EASING.move,
    });
  });

  it('moves nothing under reduced motion', () => {
    setReduced('reduce');
    expect(flip([{ element: document.createElement('tr'), fromPx: 40 }])).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('crossfade', () => {
  it('starts the exit and the entry in the same call', async () => {
    const outgoing = document.createElement('div');
    const incoming = document.createElement('div');
    const done = crossfade({ outgoing, incoming, offset: { axis: 'x', px: 16 } });
    expect(calls).toHaveLength(2);
    await done;
    expect(calls[0]?.options).toMatchObject({ duration: MOTION_MS.small, fill: 'forwards' });
    expect(calls[1]?.options).toMatchObject({ duration: MOTION_MS.medium });
    expect(calls[1]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });
});

describe('drawCheck', () => {
  it('fades the short stroke, then the long one, both done by 150 ms', () => {
    const short = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const long = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    drawCheck(short, long);
    expect(calls).toHaveLength(2);
    const [first, second] = calls.map((call) => call.options);
    expect(second?.delay).toBe(Number(first?.duration) + (first?.delay ?? 0));
    expect(Number(second?.delay) + Number(second?.duration)).toBeLessThanOrEqual(MOTION_MS.small);
    expect(calls.every((call) => JSON.stringify(call.keyframes).includes('opacity'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('strokeDashoffset');
  });
});
