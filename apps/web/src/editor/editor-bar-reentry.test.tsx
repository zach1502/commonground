import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEditorStore, type EditorStore } from '@parkshape/scene/editor';

import type { SaveStatus } from './autosave';
import { EditorBar } from './editor-bar';

const EMPTY = { version: 1, items: [], paths: [], areas: [], gradeDelta: { cells: [] }, zones: [] };

/** Finished fill 'forwards' animations keep their last keyframe inline until cancelled. */
let finishers: (() => void)[] = [];
let animated: HTMLElement[] = [];

function installFillModel(): void {
  finishers = [];
  animated = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      animated.push(this);
      let state: 'running' | 'finished' | 'cancelled' = 'running';
      let settle: (end: 'finished' | 'cancelled') => void = () => undefined;
      const finished = new Promise<void>((resolve, reject) => {
        settle = (end) => {
          if (end === 'finished') resolve();
          else reject(new Error('cancelled'));
        };
      });
      finished.catch(() => undefined);
      const end = keyframes.at(-1) ?? {};
      const fills = options.fill === 'forwards' && end.opacity !== undefined;
      finishers.push(() => {
        if (state !== 'running') return;
        state = 'finished';
        if (fills) this.style.opacity = String(end.opacity);
        settle('finished');
      });
      return {
        finished,
        cancel: () => {
          if (state === 'finished' && fills) this.style.removeProperty('opacity');
          state = 'cancelled';
          settle('cancelled');
        },
      };
    },
  });
}

async function finishAll(): Promise<void> {
  await act(async () => {
    finishers.forEach((finish) => {
      finish();
    });
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
}

function barAt(status: SaveStatus, store: EditorStore) {
  return (
    <MemoryRouter>
      <EditorBar
        heading="Design the park"
        store={store}
        status={status}
        refusal={null}
        submitting="idle"
        onSubmit={vi.fn()}
        conflict={null}
        closed={false}
        signInHref="/login"
      />
    </MemoryRouter>
  );
}

beforeEach(installFillModel);
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

describe('EditorBar failed-save alert shown again (J12)', () => {
  it('is at opacity 1 when a second failure comes before the first fade out ends', async () => {
    const store: EditorStore = createEditorStore({ document: EMPTY } as never);
    const view = render(barAt('failed', store));
    await finishAll();
    view.rerender(barAt('saved', store));
    view.rerender(barAt('failed', store));
    await finishAll();
    const alert = screen.getByRole('alert');
    const box = animated.find((element) => element.contains(alert));
    if (box === undefined) throw new Error('the alert never animated');
    expect(getComputedStyle(box).opacity || '1').toBe('1');
  });
});
