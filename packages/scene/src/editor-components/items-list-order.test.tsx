// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import type { ItemsListRow } from '../editor/items-list.js';

import { ItemsList } from './ItemsList.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

const ZONE_STRINGS = {
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

function renderList(rows: readonly ItemsListRow[]) {
  render(
    <ItemsList
      rows={rows}
      strings={ZONE_STRINGS}
      catalog={catalogItems}
      onSelect={vi.fn()}
      onNudge={vi.fn()}
      onRowAction={vi.fn()}
      onAdd={vi.fn(() => ({ valid: true as const }))}
    />,
  );
}

function rowNames(): (string | null)[] {
  const list = screen.getByRole('list', { name: 'Items' });
  return within(list)
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'))
    .map((button) => button.textContent);
}

// The far corner bench sets the park's extent; the frame starts at 0, 0.
const CORNER = row('corner', 'bench', 90, 90);

describe('ItemsList order', () => {
  it('sorts the rows in each group by name, then by place', () => {
    renderList([
      row('a', 'western-red-cedar', 45, 85),
      row('b', 'bigleaf-maple', 80, 10),
      row('c', 'western-red-cedar', 5, 5),
      row('d', 'bigleaf-maple', 45, 45),
      row('e', 'douglas-fir', 45, 85),
      CORNER,
    ]);
    expect(rowNames().slice(0, 5)).toEqual([
      'Bigleaf maple, centre',
      'Bigleaf maple, south-east corner',
      'Douglas fir, north edge',
      'Western red cedar, north edge',
      'Western red cedar, south-west corner',
    ]);
  });

  it('keeps the count of rows that share a name and a place in order', () => {
    renderList([
      row('a', 'western-red-cedar', 10, 10),
      row('b', 'western-red-cedar', 40, 80),
      row('c', 'western-red-cedar', 50, 82),
      CORNER,
    ]);
    expect(rowNames().slice(0, 3)).toEqual([
      'Western red cedar, north edge (1 of 2)',
      'Western red cedar, north edge (2 of 2)',
      'Western red cedar, south-west corner',
    ]);
  });
});

describe('ItemsList row action names', () => {
  it('starts each action name with the text the button shows (WCAG 2.5.3)', () => {
    const strings = {
      ...ZONE_STRINGS,
      toolbar: { ...ZONE_STRINGS.toolbar, rotate: 'Rotate 15 degrees' },
      itemsList: { ...ZONE_STRINGS.itemsList, rotate: 'Rotate 15 degrees, {name}' },
    };
    render(
      <ItemsList
        rows={[{ ...row('a', 'bench', 10, 10), selected: 'selected' }, CORNER]}
        strings={strings}
        catalog={catalogItems}
        onSelect={vi.fn()}
        onNudge={vi.fn()}
        onRowAction={vi.fn()}
        onAdd={vi.fn(() => ({ valid: true as const }))}
      />,
    );
    expect(screen.getByRole('button', { name: 'Rotate 15 degrees, Bench' }).textContent).toBe(
      'Rotate 15 degrees',
    );
    for (const name of ['Rotate 15 degrees, Bench', 'Duplicate Bench', 'Delete Bench']) {
      const button = screen.getByRole('button', { name });
      expect(name.startsWith(button.textContent), name).toBe(true);
    }
  });
});

describe('ItemsList scroll', () => {
  it('scrolls the selected row into view, nearest edge, when the list opens', () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scroll,
      configurable: true,
    });
    try {
      renderList([
        row('a', 'bench', 10, 10),
        row('b', 'bench', 20, 20),
        { ...row('c', 'bench', 30, 30), selected: 'selected' },
        CORNER,
      ]);
      const selected = screen.getByRole('button', { pressed: true }).closest('li');
      const last = scroll.mock.contexts.at(-1);
      expect(last).toBe(selected);
      expect(scroll.mock.calls.at(-1)).toEqual([{ block: 'nearest' }]);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});
