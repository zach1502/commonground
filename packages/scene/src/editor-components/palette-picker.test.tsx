// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import { Palette } from './Palette.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

function renderPalette(overrides: Partial<Parameters<typeof Palette>[0]> = {}) {
  const props = {
    catalog: catalogItems,
    strings: TEST_STRINGS,
    activeId: null,
    paint: 'off' as const,
    onPick: vi.fn(),
    onPaint: vi.fn(),
    ...overrides,
  };
  render(<Palette {...props} />);
  return props;
}

describe('Palette tabs and tiles', () => {
  it('shows the picker tabs with the first one open', () => {
    renderPalette();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Plants',
      'Paths',
      'Play',
      'Seating',
      'Garden',
      'Amenities',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('listbox', { name: 'Plants' })).toBeDefined();
  });

  it('draws each item as a tile named by its name and cost, with its picture', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('tab', { name: 'Seating' }));
    const bench = screen.getByRole('option', { name: 'Bench, $3,500' });
    expect(bench.getAttribute('title')).toBe('Bench');
    expect(bench.querySelector('img')?.getAttribute('src')).toBe('/catalog-thumbs/bench.png');
    expect(bench.querySelector('img')?.getAttribute('alt')).toBe('');
    fireEvent.click(screen.getByRole('tab', { name: 'Paths' }));
    expect(screen.getByRole('option', { name: 'Lawn, $15/m²' })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Garden' }));
    expect(screen.getByRole('option', { name: 'Community garden, $900/bed' })).toBeDefined();
  });

  it('opens on the tab of the item being placed and marks its tile selected', () => {
    renderPalette({ activeId: 'bench' });
    expect(screen.getByRole('tab', { name: 'Seating' }).getAttribute('aria-selected')).toBe('true');
    const bench = screen.getByRole('option', { name: 'Bench, $3,500' });
    expect(bench.getAttribute('aria-selected')).toBe('true');
    expect(bench.getAttribute('tabindex')).toBe('0');
  });

  it('toggles paint mode', () => {
    const { onPaint } = renderPalette({ paint: 'on' });
    const paint = screen.getByRole('button', { name: 'Paint mode' });
    expect(paint.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(paint);
    expect(onPaint).toHaveBeenCalledWith('off');
  });
});

describe('Palette keyboard and picks', () => {
  it('reports a pick on click and on Enter, and moves focus with the arrow keys', () => {
    const { onPick } = renderPalette();
    fireEvent.click(screen.getByRole('option', { name: /^Douglas fir/ }));
    expect(onPick).toHaveBeenLastCalledWith('douglas-fir');
    const first = screen.getByRole('option', { name: /^Bigleaf maple/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('option', { name: /^Red alder/ });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith('red-alder');
  });

  it('switches tabs with the arrow keys', () => {
    renderPalette();
    const plants = screen.getByRole('tab', { name: 'Plants' });
    fireEvent.keyDown(plants, { key: 'ArrowRight' });
    const paths = screen.getByRole('tab', { name: 'Paths' });
    expect(paths.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(paths);
  });

  it('keeps the tab after a pick, so a second copy is one click away', () => {
    const { onPick } = renderPalette();
    fireEvent.click(screen.getByRole('tab', { name: 'Seating' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bench, $3,500' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bench, $3,500' }));
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});

// Names measured in Chrome at 1440 px: these four take two lines, next to one-line names in the
// same row. Rain garden and Compost bin keep one line at 1024 and 1440.
const TWO_LINE_NAMES = {
  Garden: ['Community garden', 'Dog off-leash area'],
  Play: ['Basketball half court', 'Ball diamond backstop'],
} as const;
const ONE_LINE_NAMES = { Garden: ['Pond', 'Planter', 'Rain garden'], Play: ['Fitness station'] };
const TABS = ['Garden', 'Play'] as const;
// The widest word today is "Community", 66 px of 12 px BC Sans; the tile name box is 4.5rem.
// A word past this many letters needs a look in the browser before it ships.
const LONGEST_WORD = 10;

function nameStyleOf(text: string): CSSStyleDeclaration {
  return screen.getByText(text).style;
}

describe('Palette tile names', () => {
  it('gives every name two lines, with an ellipsis past them and the full name in the title', () => {
    renderPalette();
    const currant = screen.getByRole('option', { name: /^Red flowering currant/ });
    expect(currant.getAttribute('title')).toBe('Red flowering currant');
    const name = nameStyleOf('Red flowering currant');
    expect(name.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(name.overflow).toBe('hidden');
    expect(name.textOverflow).toBe('ellipsis');
    expect(name.whiteSpace).not.toBe('nowrap');
  });

  it.each(TABS)('breaks %s names only between words', (tab) => {
    renderPalette();
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    for (const text of [...TWO_LINE_NAMES[tab], ...ONE_LINE_NAMES[tab]]) {
      const name = nameStyleOf(text);
      expect(name.overflowWrap).toBe('normal');
      expect(name.hyphens).toBe('manual');
      expect(name.wordBreak).not.toBe('break-all');
      expect(name.cssText).not.toMatch(/anywhere|break-all/);
    }
  });

  it.each(TABS)('gives one-line and two-line %s names the same two-line box', (tab) => {
    renderPalette();
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    const [first] = ONE_LINE_NAMES[tab];
    const oneLine = nameStyleOf(first ?? '');
    expect(oneLine.minHeight).toBe('calc(2 * 1.125rem)');
    for (const text of TWO_LINE_NAMES[tab]) {
      expect(nameStyleOf(text).cssText).toBe(oneLine.cssText);
    }
  });

  it('puts every cost on one fixed line, so the costs in a row line up', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('tab', { name: 'Garden' }));
    const costs = ['Pond, $400/m²', 'Community garden, $900/bed'].map(
      (label) => screen.getByRole('option', { name: label }).lastElementChild,
    );
    for (const cost of costs) {
      expect((cost as HTMLElement).style.minHeight).toBe('1.125rem');
      expect((cost as HTMLElement).style.whiteSpace).toBe('nowrap');
    }
  });

  it('has no catalog word too long for a tile', () => {
    const words = catalogItems.flatMap((entry) => entry.name.split(/[\s-]+/));
    expect(words.filter((word) => word.length > LONGEST_WORD)).toEqual([]);
  });
});
