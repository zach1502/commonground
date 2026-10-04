// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import type { ItemsListRow } from '../editor/items-list.js';

import { Hints } from './Hints.js';
import { ItemsList } from './ItemsList.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { ShortcutsSheet } from './ShortcutsSheet.js';
import { TEST_STRINGS } from './test-strings.js';

interface Call {
  readonly element: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

let calls: Call[] = [];
let finishAll: () => void = () => undefined;

function installAnimate() {
  calls = [];
  let release: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  finishAll = release;
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ element: this, keyframes, options });
      return { finished };
    },
  });
}

function reduceMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('reduce') }),
  });
}

beforeEach(installAnimate);
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  Reflect.deleteProperty(window, 'matchMedia');
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

describe('J4 shortcuts sheet', () => {
  it('rises 8 px over 250 ms as it opens and stays until its 150 ms exit ends', async () => {
    const view = render(<ShortcutsSheet state="closed" strings={TEST_STRINGS} onClose={vi.fn()} />);
    view.rerender(<ShortcutsSheet state="open" strings={TEST_STRINGS} onClose={vi.fn()} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(8px)' });
    expect(calls[0]?.options.duration).toBe(250);
    view.rerender(<ShortcutsSheet state="closed" strings={TEST_STRINGS} onClose={vi.fn()} />);
    expect(calls[1]?.options.duration).toBe(150);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens and closes with no animate call under reduced motion', () => {
    reduceMotion();
    const view = render(<ShortcutsSheet state="closed" strings={TEST_STRINGS} onClose={vi.fn()} />);
    view.rerender(<ShortcutsSheet state="open" strings={TEST_STRINGS} onClose={vi.fn()} />);
    view.rerender(<ShortcutsSheet state="closed" strings={TEST_STRINGS} onClose={vi.fn()} />);
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('J5 properties panel', () => {
  it('slides in from translateX(16px) when a selection is made', () => {
    const view = render(
      <PropertiesPanel properties={{ kind: 'none' }} strings={TEST_STRINGS} {...handlers()} />,
    );
    view.rerender(
      <PropertiesPanel properties={bench('b1')} strings={TEST_STRINGS} {...handlers()} />,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateX(16px)' });
  });

  it('keeps its empty state readable when nothing is selected', () => {
    render(
      <PropertiesPanel properties={{ kind: 'none' }} strings={TEST_STRINGS} {...handlers()} />,
    );
    expect(screen.getByRole('heading', { name: TEST_STRINGS.properties.heading })).toBeDefined();
  });

  it('runs no new animation when a second item is selected while it is shown', () => {
    const view = render(
      <PropertiesPanel properties={{ kind: 'none' }} strings={TEST_STRINGS} {...handlers()} />,
    );
    view.rerender(
      <PropertiesPanel properties={bench('b1')} strings={TEST_STRINGS} {...handlers()} />,
    );
    view.rerender(
      <PropertiesPanel properties={bench('b2')} strings={TEST_STRINGS} {...handlers()} />,
    );
    expect(calls).toHaveLength(1);
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

describe('J7 items list rows', () => {
  it('fades in only the added row, with one opacity animation and none on height', () => {
    const view = render(list([row('a')]));
    expect(calls).toHaveLength(0);
    view.rerender(list([row('a'), row('b')]));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(calls[0]?.options.duration).toBe(150);
    expect(JSON.stringify(calls[0]?.keyframes)).not.toContain('height');
  });

  it('lets a removed row leave at once', () => {
    const view = render(list([row('a'), row('b')]));
    view.rerender(list([row('a')]));
    expect(calls).toHaveLength(0);
    expect(document.querySelectorAll('[data-row]')).toHaveLength(1);
  });
});

describe('J22 first-visit hints', () => {
  it('fades the due hint in once and out once, saving the dismissal before the exit ends', () => {
    const onDismiss = vi.fn();
    const pending = { camera: 'pending', path: 'dismissed' } as const;
    const view = render(
      <Hints hints={pending} toolKind="select" strings={TEST_STRINGS} onDismiss={onDismiss} />,
    );
    expect(calls).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: TEST_STRINGS.hints.dismiss }));
    expect(onDismiss).toHaveBeenCalledWith('camera');
    view.rerender(
      <Hints
        hints={{ camera: 'dismissed', path: 'dismissed' }}
        toolKind="select"
        strings={TEST_STRINGS}
        onDismiss={onDismiss}
      />,
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});
