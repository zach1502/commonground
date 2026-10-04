// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanePoint } from '@parkshape/core';

import type { BrushPhase } from './level-tween.js';
import { useBrushRingFrames, type FadedLine } from './use-brush-ring.js';

const invalidate = vi.fn();
let frame: () => void = () => undefined;

vi.mock('@react-three/fiber', () => ({
  useThree: (pick: (state: { invalidate: () => void }) => unknown) => pick({ invalidate }),
  useFrame: (callback: () => void) => {
    frame = callback;
  },
}));

interface Props {
  readonly phase: BrushPhase;
  readonly centre: PlanePoint | null;
}

const line = (): FadedLine => ({ material: { opacity: 0 } });

beforeEach(() => {
  invalidate.mockClear();
});
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useBrushRingFrames (J19)', () => {
  it('asks for a frame when the hover first gives the ring a centre, so it shows at once', () => {
    const lines = { current: [line(), line()] };
    const view = renderHook(
      (props: Props) => {
        useBrushRingFrames(props, lines);
      },
      {
        initialProps: { phase: 'aiming', centre: null },
      },
    );
    invalidate.mockClear();
    view.rerender({ phase: 'aiming', centre: { x: 75, y: 75 } });
    expect(invalidate).toHaveBeenCalled();
  });

  it('draws the hover ring at half strength', () => {
    const lines = { current: [line(), line()] };
    renderHook(() => {
      useBrushRingFrames({ phase: 'aiming', centre: { x: 1, y: 2 } }, lines);
    });
    frame();
    expect(lines.current.map((faded) => faded.material.opacity)).toEqual([0.5, 0.5]);
  });

  it('jumps to full strength in the first frame of a press under reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce') }),
    });
    const lines = { current: [line(), line()] };
    const view = renderHook(
      (props: Props) => {
        useBrushRingFrames(props, lines);
      },
      {
        initialProps: { phase: 'aiming', centre: { x: 1, y: 2 } },
      },
    );
    view.rerender({ phase: 'applying', centre: { x: 1, y: 2 } });
    frame();
    expect(lines.current.map((faded) => faded.material.opacity)).toEqual([1, 1]);
  });
});
