import { readFileSync } from 'node:fs';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_CLASS, MOTION_MS, PROGRESS_DELAY_MS } from './motion/index.js';
import { IndeterminateProgress, SuccessCheck } from './progress.js';
import { SkeletonReveal } from './skeleton.js';

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

let played: Played[] = [];

function setReduced(reduce: 'reduce' | 'no-preference') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce === 'reduce' && query.includes('reduce'),
  }));
}

beforeEach(() => {
  played = [];
  setReduced('no-preference');
  Element.prototype.animate = function animate(this: Element, keyframes, options) {
    played.push({
      target: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
    });
    return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
});

describe('IndeterminateProgress (J21)', () => {
  it('mounts at 1 s, not before', () => {
    vi.useFakeTimers();
    render(<IndeterminateProgress label="Submitting" />);
    act(() => {
      vi.advanceTimersByTime(PROGRESS_DELAY_MS - 1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('progressbar', { name: 'Submitting' })).toBeInTheDocument();
  });

  it('loops through the one progress class, which is linear and off under reduced motion', () => {
    vi.useFakeTimers();
    const { container } = render(<IndeterminateProgress label="Submitting" />);
    act(() => {
      vi.advanceTimersByTime(PROGRESS_DELAY_MS);
    });
    expect(container.querySelector(`.${MOTION_CLASS.progress}`)).not.toBeNull();
    const css = readFileSync(`${import.meta.dirname}/components.css`, 'utf8');
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.ps-progress__bar\s*\{\s*inline-size: 100%;/,
    );
  });
});

describe('SuccessCheck (J21)', () => {
  it('fades the short stroke, then the long one, done by 150 ms, with no dash animation', () => {
    const { container } = render(<SuccessCheck />);
    const [short, long] = Array.from(container.querySelectorAll('path'));
    expect(played.map((call) => call.target)).toEqual([short, long]);
    const [first, second] = played.map((call) => call.options);
    expect(second?.delay).toBe(Number(first?.duration));
    expect(Number(second?.delay) + Number(second?.duration)).toBeLessThanOrEqual(MOTION_MS.small);
    expect(JSON.stringify(played.map((call) => call.keyframes))).not.toMatch(/dash/i);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('is a static check under reduced motion', () => {
    setReduced('reduce');
    const { container } = render(<SuccessCheck />);
    expect(played).toHaveLength(0);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});

describe('SkeletonReveal (J13)', () => {
  function Harness({ state, reveal }: { state: 'waiting' | 'ready'; reveal: 'fade' | 'instant' }) {
    return (
      <SkeletonReveal state={state} reveal={reveal} className="web-outlet">
        <p>Designs</p>
      </SkeletonReveal>
    );
  }

  it('fades the content in once over 150 ms after a wait, in the same slot', () => {
    const { container, rerender } = render(<Harness state="waiting" reveal="fade" />);
    const slot = container.querySelector('.web-outlet');
    expect(slot).toHaveAttribute('hidden');
    expect(played).toHaveLength(0);
    rerender(<Harness state="ready" reveal="fade" />);
    expect(slot).not.toHaveAttribute('hidden');
    expect(played).toHaveLength(1);
    expect(played[0]?.target).toBe(slot);
    expect(played[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played[0]?.options).toMatchObject({ duration: MOTION_MS.small });
    // No fill holds a frame once the fade ends, so the slot shows the content it now holds.
    expect(played[0]?.options.fill).toBeUndefined();
    expect(slot).toHaveTextContent('Designs');
    rerender(<Harness state="ready" reveal="fade" />);
    expect(played).toHaveLength(1);
  });

  it('never fades content that did not wait', () => {
    render(<Harness state="ready" reveal="fade" />);
    expect(played).toHaveLength(0);
  });

  it('swaps at once for a route whose first paint is its LCP, such as the vote route', () => {
    const { rerender } = render(<Harness state="waiting" reveal="instant" />);
    rerender(<Harness state="ready" reveal="fade" />);
    expect(played).toHaveLength(0);
  });

  it('swaps at once under reduced motion', () => {
    setReduced('reduce');
    const { rerender } = render(<Harness state="waiting" reveal="fade" />);
    rerender(<Harness state="ready" reveal="fade" />);
    expect(played).toHaveLength(0);
  });
});
