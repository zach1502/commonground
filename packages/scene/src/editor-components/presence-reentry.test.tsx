// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import type { ItemsListRow } from '../editor/items-list.js';

import { ItemsList } from './ItemsList.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { ShortcutsSheet } from './ShortcutsSheet.js';
import { TEST_STRINGS } from './test-strings.js';

/**
 * A small model of Web Animations fill: a finished effect with fill 'forwards' keeps its last
 * keyframe on the element until it is cancelled, which is what leaves a mounted panel invisible.
 */
interface FakeAnimation {
  readonly finished: Promise<void>;
  readonly finish: () => void;
  readonly cancel: () => void;
}

let effects: FakeAnimation[] = [];

function hold(element: HTMLElement, end: Keyframe): void {
  if (end.opacity !== undefined) element.style.opacity = String(end.opacity);
  if (end.transform !== undefined) element.style.transform = String(end.transform);
}

function release(element: HTMLElement, end: Keyframe): void {
  if (end.opacity !== undefined) element.style.removeProperty('opacity');
  if (end.transform !== undefined) element.style.removeProperty('transform');
}

function fakeAnimation(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): FakeAnimation {
  let settle: (end: 'finished' | 'cancelled') => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    settle = (end) => {
      if (end === 'finished') resolve();
      else reject(new Error('cancelled'));
    };
  });
  finished.catch(() => undefined);
  let state: 'running' | 'finished' | 'cancelled' = 'running';
  const end = keyframes.at(-1) ?? {};
  const fills = options.fill === 'forwards';
  return {
    finished,
    finish() {
      if (state !== 'running') return;
      state = 'finished';
      if (fills) hold(element, end);
      settle('finished');
    },
    cancel() {
      if (state === 'cancelled') return;
      if (state === 'finished' && fills) release(element, end);
      state = 'cancelled';
      settle('cancelled');
    },
  };
}

function installFillModel(): void {
  effects = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const effect = fakeAnimation(this, keyframes, options);
      effects.push(effect);
      return effect;
    },
  });
}

async function finishAll(): Promise<void> {
  await act(async () => {
    effects.forEach((effect) => {
      effect.finish();
    });
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
}

/** The computed look, with the CSS initial values where jsdom leaves a property empty. */
function look(element: Element | null | undefined) {
  if (element === null || element === undefined) throw new Error('no element');
  const style = getComputedStyle(element);
  return { opacity: style.opacity || '1', transform: style.transform || 'none' };
}

const SHOWN = { opacity: '1', transform: 'none' };

beforeEach(installFillModel);
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

const handlers = () => ({ onPosition: vi.fn(), onRotation: vi.fn(), onAddCorner: vi.fn() });
const bench = (id: string) =>
  ({
    kind: 'item',
    id,
    catalogId: 'bench',
    category: 'seating',
    costCad: 3500,
    x: 10,
    y: 12.5,
    rotationDeg: 15,
  }) as const;
const panel = (properties: Parameters<typeof PropertiesPanel>[0]['properties']) => (
  <PropertiesPanel properties={properties} strings={TEST_STRINGS} {...handlers()} />
);
const panelBody = (name: string) => screen.getByRole('heading', { name }).parentElement;

describe('J5 properties panel after select, clear and select again', () => {
  it('shows the second selection at opacity 1 with no transform once its entry ends', async () => {
    const view = render(panel({ kind: 'none' }));
    view.rerender(panel(bench('b1')));
    await finishAll();
    view.rerender(panel({ kind: 'none' }));
    await finishAll();
    view.rerender(panel(bench('b1')));
    await finishAll();
    expect(look(panelBody(TEST_STRINGS.catalog.bench ?? 'bench'))).toEqual(SHOWN);
  });

  it('shows the empty state at opacity 1 once the exit ends', async () => {
    const view = render(panel({ kind: 'none' }));
    view.rerender(panel(bench('b1')));
    await finishAll();
    view.rerender(panel({ kind: 'none' }));
    await finishAll();
    expect(look(panelBody(TEST_STRINGS.properties.heading))).toEqual(SHOWN);
  });

  it('shows the selection that comes back before the exit ends', async () => {
    const view = render(panel({ kind: 'none' }));
    view.rerender(panel(bench('b1')));
    await finishAll();
    view.rerender(panel({ kind: 'none' }));
    view.rerender(panel(bench('b2')));
    await finishAll();
    expect(look(panelBody(TEST_STRINGS.catalog.bench ?? 'bench'))).toEqual(SHOWN);
  });
});

const sheet = (state: 'open' | 'closed') => (
  <ShortcutsSheet state={state} strings={TEST_STRINGS} onClose={vi.fn()} />
);

describe('J4 shortcuts sheet reopened', () => {
  it('is at opacity 1 when it opens again before its exit ends', async () => {
    const view = render(sheet('closed'));
    view.rerender(sheet('open'));
    await finishAll();
    view.rerender(sheet('closed'));
    view.rerender(sheet('open'));
    await finishAll();
    expect(look(screen.getByRole('dialog'))).toEqual(SHOWN);
  });

  it('is at opacity 1 when it opens again after it closed', async () => {
    const view = render(sheet('closed'));
    view.rerender(sheet('open'));
    await finishAll();
    view.rerender(sheet('closed'));
    await finishAll();
    view.rerender(sheet('open'));
    await finishAll();
    expect(look(screen.getByRole('dialog'))).toEqual(SHOWN);
  });
});

function row(id: string): ItemsListRow {
  return {
    kind: 'item',
    id,
    catalogId: 'bench',
    x: 10,
    y: 10,
    locked: 'free',
    selected: 'not-selected',
  };
}

function list(rows: readonly ItemsListRow[]) {
  return (
    <ItemsList
      rows={rows}
      strings={TEST_STRINGS}
      catalog={catalogItems}
      onSelect={vi.fn()}
      onNudge={vi.fn()}
      onRowAction={vi.fn()}
      onAdd={vi.fn(() => ({ valid: true as const }))}
    />
  );
}

describe('J7 items list row added again', () => {
  it('is at opacity 1 once its fade ends after it was removed and added back', async () => {
    const view = render(list([row('a')]));
    view.rerender(list([row('a'), row('b')]));
    await finishAll();
    view.rerender(list([row('a')]));
    view.rerender(list([row('a'), row('b')]));
    await finishAll();
    const rows = document.querySelectorAll('[data-row]');
    expect(rows).toHaveLength(2);
    expect(look(rows[1])).toEqual(SHOWN);
  });
});
