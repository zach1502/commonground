// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import { contextFor } from '../editor/actions/test-context.js';
import type { ItemsListRow } from '../editor/items-list.js';
import { docOf, treeInput } from '../editor/test-fixtures.js';

import { ItemsList } from './ItemsList.js';
import { DetailsSidebar } from './Sidebars.js';
import type { EditorStrings } from './strings.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

const PLACE_STRINGS = {
  ...TEST_STRINGS,
  itemsList: {
    ...TEST_STRINGS.itemsList,
    place: '{name}, {zone}',
    placeOfMany: '{name}, {zone} ({index} of {count})',
    zones: {
      north: 'north edge',
      'north-east': 'north-east corner',
      east: 'east edge',
      'south-east': 'south-east corner',
      south: 'south edge',
      'south-west': 'south-west corner',
      west: 'west edge',
      'north-west': 'north-west corner',
      centre: 'centre',
    },
  },
};

function row(id: string, catalogId: string, x: number, y: number): ItemsListRow {
  return { kind: 'item', id, catalogId, x, y, locked: 'free', selected: 'not-selected' };
}

function renderRows(rows: readonly ItemsListRow[], strings: EditorStrings = PLACE_STRINGS) {
  render(
    <ItemsList
      rows={rows}
      strings={strings}
      catalog={catalogItems}
      onSelect={vi.fn()}
      onNudge={vi.fn()}
      onRowAction={vi.fn()}
      onAdd={vi.fn(() => ({ valid: true as const }))}
    />,
  );
  const list = screen.getByRole('list', { name: 'Items' });
  return within(list)
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'))
    .map((button) => button.textContent);
}

// The far corner row sets the extent of the park; the frame starts at 0, 0.
const CORNER = row('corner', 'bench', 90, 90);

describe('ItemsList place names', () => {
  it('names a row by its compass zone and never by coordinates', () => {
    const names = renderRows([
      row('a', 'western-red-cedar', 45, 85),
      row('b', 'bench', 45, 45),
      CORNER,
    ]);
    expect(names.slice(0, 2)).toEqual(['Western red cedar, north edge', 'Bench, centre']);
    expect(names.join(' ')).not.toMatch(/\d+\.\d|\bat\b/);
  });

  it('uses corner words for the corner zones', () => {
    const names = renderRows([row('a', 'red-alder', 5, 5), CORNER]);
    expect(names).toEqual(['Red alder, south-west corner', 'Bench, north-east corner']);
  });

  it('counts rows that share a name and a zone in list order, then sorts by place', () => {
    const names = renderRows([
      row('a', 'western-red-cedar', 40, 80),
      row('b', 'western-red-cedar', 50, 82),
      row('c', 'western-red-cedar', 10, 10),
      row('d', 'western-red-cedar', 55, 88),
      CORNER,
    ]);
    expect(names.slice(0, 4)).toEqual([
      'Western red cedar, north edge (1 of 3)',
      'Western red cedar, north edge (2 of 3)',
      'Western red cedar, north edge (3 of 3)',
      'Western red cedar, south-west corner',
    ]);
  });

  it('puts the Locked tag in its own column of the item row', () => {
    renderRows([{ ...row('a', 'western-red-cedar', 45, 85), locked: 'locked' }, CORNER]);
    const tag = screen.getByText('Locked');
    const name = screen.getByRole('button', { name: 'Western red cedar, north edge' });
    expect(tag.closest('[data-row]')).toBe(name.closest('[data-row]'));
    expect(tag.closest('[data-cell]')?.getAttribute('data-cell')).toBe('status');
    expect(tag.textContent).toBe('Locked');
    expect(name.closest('[data-cell]')?.getAttribute('data-cell')).toBe('name');
  });

  it('falls back to the position template when the app gives no place words', () => {
    const names = renderRows([row('a', 'bench', 10, 12.5)], TEST_STRINGS);
    expect(names[0]).toContain('10, 12.5');
  });
});

function nth(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index];
  if (element === undefined) throw new Error(`no element ${String(index)}`);
  return element;
}

describe('ItemsList groups', () => {
  it('groups rows under category headings with a count, in catalog order', () => {
    const names = renderRows([
      row('a', 'bench', 10, 10),
      row('b', 'red-alder', 20, 20),
      row('c', 'red-alder', 80, 80),
      CORNER,
    ]);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Cat tree 2', 'Cat seating 2']);
    expect(names.slice(0, 2)).toEqual([
      'Red alder, north-east corner',
      'Red alder, south-west corner',
    ]);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('ItemsList rows', () => {
  it('lays every row on the list grid with a name and a status column', () => {
    renderRows([row('a', 'red-alder', 5, 5), CORNER]);
    const list = screen.getByRole('list', { name: 'Items' });
    expect(list.style.display).toBe('grid');
    for (const item of screen.getAllByRole('listitem')) {
      const line = item.querySelector<HTMLElement>('[data-row]');
      expect(line?.style.gridTemplateColumns).toBe('subgrid');
      const cells = [...(line?.querySelectorAll('[data-cell]') ?? [])];
      expect(cells.map((cell) => cell.getAttribute('data-cell'))).toEqual(['name', 'status']);
    }
  });

  it('draws rows as ruled 32 px lines, not bordered boxes', () => {
    renderRows([row('a', 'red-alder', 5, 5), CORNER]);
    const [alder] = screen.getAllByRole('listitem');
    const line = alder?.querySelector<HTMLElement>('[data-row]');
    expect(line?.style.minBlockSize).toBe('var(--layout-padding-xlarge)');
    expect(line?.style.borderBlockEnd).toContain('var(--surface-color-border-default)');
    const name = screen.getByRole('button', { name: 'Red alder, south-west corner' });
    expect(name.style.border).toContain('transparent');
    expect(name.style.background).toBe('transparent');
  });

  it('gives the selected free row the actions, and a locked row none', () => {
    renderRows([
      { ...row('a', 'red-alder', 5, 5), locked: 'locked' },
      row('b', 'bench', 50, 50),
      { ...CORNER, selected: 'selected' },
    ]);
    const items = screen.getAllByRole('listitem');
    const locked = within(nth(items, 0));
    expect(locked.getByText('Locked')).toBeDefined();
    expect(locked.queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(within(nth(items, 1)).queryByRole('button', { name: /^Delete/ })).toBeNull();
    const selected = within(nth(items, 2));
    expect(selected.getByRole('button', { name: 'Rotate Bench' })).toBeDefined();
    expect(selected.getByRole('button', { name: 'Duplicate Bench' })).toBeDefined();
    expect(selected.getByRole('button', { name: 'Delete Bench' })).toBeDefined();
  });
});

function openList() {
  const ctx = contextFor(docOf({ items: [treeInput('t1', 10, 10), treeInput('t2', 30, 30)] }));
  ctx.store.getState().setItemsList('shown');
  render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
  return ctx;
}

const rowButton = (index: number) =>
  nth(
    screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed')),
    index,
  );

describe('ItemsList actions and selection', () => {
  it('rotates, duplicates and deletes from a row through the toolbar actions', () => {
    const ctx = openList();
    fireEvent.keyDown(rowButton(1), { key: 'Enter' });
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: 't2' }]);
    const second = within(nth(screen.getAllByRole('listitem'), 1));
    fireEvent.click(second.getByRole('button', { name: 'Rotate Bigleaf maple' }));
    expect(ctx.store.getState().document.items[1]?.rotationDeg).toBe(15);
    fireEvent.click(second.getByRole('button', { name: 'Duplicate Bigleaf maple' }));
    expect(ctx.store.getState().document.items).toHaveLength(3);
    fireEvent.click(rowButton(0));
    const first = within(nth(screen.getAllByRole('listitem'), 0));
    fireEvent.click(first.getByRole('button', { name: 'Delete Bigleaf maple' }));
    expect(ctx.store.getState().document.items.map((item) => item.id)).not.toContain('t1');
  });

  it('marks and scrolls to the row the canvas selects', () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scroll,
      configurable: true,
    });
    try {
      const ctx = openList();
      scroll.mockClear();
      act(() => {
        ctx.store.getState().select([{ kind: 'item', id: 't2' }], 'replace');
      });
      const second = nth(screen.getAllByRole('listitem'), 1);
      const name = within(second).getByRole('button', { pressed: true });
      const line = second.querySelector<HTMLElement>('[data-row]');
      expect(line?.getAttribute('style')).toContain('var(--surface-color-border-dark)');
      expect(name).toBeDefined();
      expect(scroll.mock.contexts).toContain(second);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});

describe('ItemsList keyboard', () => {
  it('keeps one row in the tab order and moves between rows with the arrow keys', () => {
    openList();
    const tabbable = () => screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(tabbable().filter((b) => b.hasAttribute('aria-pressed'))).toEqual([rowButton(0)]);
    rowButton(0).focus();
    fireEvent.keyDown(rowButton(0), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rowButton(1));
    fireEvent.keyDown(rowButton(1), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rowButton(1));
    fireEvent.keyDown(rowButton(1), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rowButton(0));
    fireEvent.keyDown(rowButton(0), { key: 'End' });
    expect(document.activeElement).toBe(rowButton(1));
    fireEvent.keyDown(rowButton(1), { key: 'Home' });
    expect(document.activeElement).toBe(rowButton(0));
  });

  it('selects the focused row with Enter', () => {
    const ctx = openList();
    fireEvent.keyDown(rowButton(1), { key: 'Enter' });
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: 't2' }]);
    expect(rowButton(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('removes the focused free row with Delete, and moves focus to the next row', () => {
    const ctx = openList();
    const shortcut = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      rowButton(0).focus();
      fireEvent.keyDown(rowButton(0), { key: 'Delete' });
      expect(ctx.store.getState().document.items.map((item) => item.id)).toEqual(['t2']);
      expect(shortcut).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(rowButton(0));
      expect(rowButton(0).textContent).toContain('30, 30');
    } finally {
      window.removeEventListener('keydown', shortcut);
    }
  });

  it('keeps a locked row with Delete', () => {
    const onRowAction = vi.fn();
    render(
      <ItemsList
        rows={[{ ...row('a', 'red-alder', 5, 5), locked: 'locked' }]}
        strings={PLACE_STRINGS}
        catalog={catalogItems}
        onSelect={vi.fn()}
        onNudge={vi.fn()}
        onRowAction={onRowAction}
        onAdd={vi.fn(() => ({ valid: true as const }))}
      />,
    );
    fireEvent.keyDown(rowButton(0), { key: 'Delete' });
    expect(onRowAction).not.toHaveBeenCalled();
  });
});
