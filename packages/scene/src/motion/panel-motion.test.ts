import { describe, expect, it, vi } from 'vitest';

import {
  clearExit,
  FADE,
  FROM_RIGHT,
  playEnter,
  playExit,
  RISE_FROM_BELOW,
  type Animatable,
} from './panel-motion.js';
import { cssCurve } from './tokens.js';

function fakeElement() {
  const finished = Promise.resolve();
  const animate = vi.fn<
    (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => { readonly finished: Promise<unknown> }
  >(() => ({ finished }));
  return { element: { animate } satisfies Animatable, animate };
}

describe('playEnter', () => {
  it('rises the shortcuts sheet 8 px from below over 250 ms on the entry curve', () => {
    const { element, animate } = fakeElement();
    playEnter(element, { ...RISE_FROM_BELOW, motion: 'full' });
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 250, easing: cssCurve('entry') },
    );
  });

  it('slides the properties panel in 16 px from the right', () => {
    const { element, animate } = fakeElement();
    playEnter(element, { ...FROM_RIGHT, motion: 'full' });
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0, transform: 'translateX(16px)' },
      { opacity: 1, transform: 'none' },
    ]);
  });

  it('fades a hint or a new row in over 150 ms', () => {
    const { element, animate } = fakeElement();
    playEnter(element, { ...FADE, motion: 'full' });
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: cssCurve('entry'),
    });
  });

  it('does not call animate under reduced motion', () => {
    const { element, animate } = fakeElement();
    playEnter(element, { ...RISE_FROM_BELOW, motion: 'reduced' });
    expect(animate).not.toHaveBeenCalled();
  });

  it('does nothing for a missing element or a browser with no Web Animations', () => {
    expect(() => {
      playEnter(null, { ...FADE, motion: 'full' });
      playEnter({}, { ...FADE, motion: 'full' });
    }).not.toThrow();
  });
});

describe('playExit', () => {
  it('reverses the entry over 150 ms on the exit curve and resolves when it finishes', async () => {
    const { element, animate } = fakeElement();
    await playExit(element, { ...RISE_FROM_BELOW, motion: 'full' });
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(8px)' },
      ],
      { duration: 150, easing: cssCurve('exit'), fill: 'forwards' },
    );
  });

  it('resolves at once with no animation under reduced motion', async () => {
    const { element, animate } = fakeElement();
    await playExit(element, { ...FADE, motion: 'reduced' });
    expect(animate).not.toHaveBeenCalled();
  });

  it('is cancelled by the next entry on the same element, so its held end state goes', async () => {
    const cancel = vi.fn();
    const element = { animate: vi.fn(() => ({ finished: Promise.resolve(), cancel })) };
    await playExit(element, { ...FROM_RIGHT, motion: 'full' });
    playEnter(element, { ...FROM_RIGHT, motion: 'full' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('is cancelled by clearExit once the caller has swapped or removed the content', async () => {
    const cancel = vi.fn();
    const element = { animate: vi.fn(() => ({ finished: Promise.resolve(), cancel })) };
    await playExit(element, { ...FROM_RIGHT, motion: 'full' });
    clearExit(element);
    clearExit(element);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('resolves when the animation is cancelled', async () => {
    const element = { animate: () => ({ finished: Promise.reject(new Error('cancelled')) }) };
    await expect(playExit(element, { ...FADE, motion: 'full' })).resolves.toBeUndefined();
  });
});
