// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogItems } from '@parkshape/core';

import { ItemsList } from './ItemsList.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

const rows = [
  {
    kind: 'item',
    id: 't1',
    catalogId: 'bigleaf-maple',
    x: 10,
    y: 12.5,
    locked: 'free',
    selected: 'selected',
  },
  {
    kind: 'item',
    id: 'old',
    catalogId: 'bench',
    x: 20,
    y: 20,
    locked: 'locked',
    selected: 'not-selected',
  },
] as const;

function renderList(overrides: Partial<Parameters<typeof ItemsList>[0]> = {}) {
  const props = {
    rows,
    strings: TEST_STRINGS,
    catalog: catalogItems,
    onSelect: vi.fn(),
    onNudge: vi.fn(),
    onRowAction: vi.fn(),
    onAdd: vi.fn(() => ({ valid: true as const })),
    ...overrides,
  };
  render(<ItemsList {...props} />);
  return props;
}

describe('ItemsList', () => {
  it('lists every element with its position and a lock badge', () => {
    renderList();
    const list = screen.getByRole('list', { name: 'Items' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Bigleaf maple');
    expect(items[0]?.textContent).toContain('10, 12.5');
    const bench = items[1];
    if (bench === undefined) throw new Error('two rows');
    expect(within(bench).getByText('Locked')).toBeDefined();
  });

  it('selects a row with its button and marks the selected one as pressed', () => {
    const props = renderList();
    const bench = screen.getByRole('button', { name: /^Bench/ });
    expect(bench.getAttribute('aria-pressed')).toBe('false');
    expect(bench.hasAttribute('disabled')).toBe(false);
    fireEvent.click(bench);
    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'item', id: 'old' });
    const tree = screen.getByRole('button', { name: /^Bigleaf maple/ });
    expect(tree.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tree);
    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'item', id: 't1' });
  });

  it('nudges and deletes the selected element', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'North' }));
    fireEvent.click(screen.getByRole('button', { name: 'West' }));
    expect(props.onNudge).toHaveBeenNthCalledWith(1, { x: 0, y: 0.5 });
    expect(props.onNudge).toHaveBeenNthCalledWith(2, { x: -0.5, y: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bigleaf maple' }));
    expect(props.onRowAction).toHaveBeenCalledWith('delete', { kind: 'item', id: 't1' });
  });
});

describe('ItemsList add form', () => {
  it('adds an item from typed coordinates', () => {
    const props = renderList();
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'bench' } });
    fireEvent.change(screen.getByLabelText('East (m)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('North (m)'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(props.onAdd).toHaveBeenCalledWith('bench', { x: 15, y: 7.5 });
  });

  it('shows why an item could not be added, next to the form', () => {
    renderList({ onAdd: () => ({ valid: false, reason: 'locked footprint', label: 'Bench' }) });
    fireEvent.change(screen.getByLabelText('East (m)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('North (m)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toBe('On Bench, which is locked');
  });

  it('ignores Add when a coordinate is not a number', () => {
    const props = renderList();
    fireEvent.change(screen.getByLabelText('East (m)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('says so when the design is empty', () => {
    renderList({ rows: [] });
    expect(screen.getByText('No items yet')).toBeDefined();
  });
});

describe('PropertiesPanel', () => {
  const handlers = () => ({ onPosition: vi.fn(), onRotation: vi.fn(), onAddCorner: vi.fn() });

  it('renders no sentence when nothing is selected, and counts a multi-selection', () => {
    const { rerender } = render(
      <PropertiesPanel properties={{ kind: 'none' }} strings={TEST_STRINGS} {...handlers()} />,
    );
    expect(screen.queryByText('Nothing selected')).toBeNull();
    expect(screen.queryByRole('paragraph')).toBeNull();
    rerender(
      <PropertiesPanel
        properties={{ kind: 'many', count: 3 }}
        strings={TEST_STRINGS}
        {...handlers()}
      />,
    );
    expect(screen.getByText('3 selected')).toBeDefined();
  });
});

describe('PropertiesPanel for one item', () => {
  const handlers = () => ({ onPosition: vi.fn(), onRotation: vi.fn(), onAddCorner: vi.fn() });

  it('edits the exact position and rotation of an item on Enter or blur', () => {
    const props = handlers();
    render(
      <PropertiesPanel
        properties={{
          kind: 'item',
          id: 't1',
          catalogId: 'bench',
          category: 'seating',
          costCad: 3500,
          x: 10,
          y: 12.5,
          rotationDeg: 15,
        }}
        strings={TEST_STRINGS}
        {...props}
      />,
    );
    const east = screen.getByLabelText('East (m)');
    expect((east as HTMLInputElement).value).toBe('10');
    fireEvent.change(east, { target: { value: '11.25' } });
    fireEvent.keyDown(east, { key: 'Enter' });
    expect(props.onPosition).toHaveBeenCalledWith('t1', { x: 11.25, y: 12.5 });
    const rotation = screen.getByLabelText('Rotation (degrees)');
    fireEvent.change(rotation, { target: { value: '90' } });
    fireEvent.blur(rotation);
    expect(props.onRotation).toHaveBeenCalledWith('t1', 90);
  });

  it('does not commit an unchanged or empty field', () => {
    const props = handlers();
    render(
      <PropertiesPanel
        properties={{
          kind: 'item',
          id: 't1',
          catalogId: 'bench',
          category: 'seating',
          costCad: 3500,
          x: 10,
          y: 12.5,
          rotationDeg: 15,
        }}
        strings={TEST_STRINGS}
        {...props}
      />,
    );
    fireEvent.blur(screen.getByLabelText('North (m)'));
    fireEvent.change(screen.getByLabelText('North (m)'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('North (m)'));
    expect(props.onPosition).not.toHaveBeenCalled();
  });
});

describe('PropertiesPanel names what was clicked (owner bug 2)', () => {
  const handlers = () => ({ onPosition: vi.fn(), onRotation: vi.fn(), onAddCorner: vi.fn() });

  it('shows the item name, its kind and its unit cost above the fields', () => {
    render(
      <PropertiesPanel
        properties={{
          kind: 'item',
          id: 't1',
          catalogId: 'bench',
          category: 'seating',
          costCad: 3500,
          x: 10,
          y: 12.5,
          rotationDeg: 15,
        }}
        strings={TEST_STRINGS}
        {...handlers()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Bench' })).toBeDefined();
    expect(screen.getByText('Kind')).toBeDefined();
    expect(screen.getByText('Cat seating')).toBeDefined();
    expect(screen.getByText('Cost')).toBeDefined();
    expect(screen.getByText('$3,500')).toBeDefined();
    expect(screen.getByLabelText('East (m)')).toBeDefined();
  });
});

describe('PropertiesPanel for areas and paths', () => {
  const handlers = () => ({ onPosition: vi.fn(), onRotation: vi.fn(), onAddCorner: vi.fn() });

  it('shows the area, plots and Add corner for an area', () => {
    const props = handlers();
    render(
      <PropertiesPanel
        properties={{
          kind: 'area',
          id: 'a1',
          catalogId: 'community-garden',
          areaM2: 141.36,
          plots: 18,
          minAreaM2: 40,
        }}
        strings={TEST_STRINGS}
        {...props}
      />,
    );
    expect(screen.getByText('141.4 m²')).toBeDefined();
    expect(screen.getByText('18')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add corner' }));
    expect(props.onAddCorner).toHaveBeenCalledWith('a1');
  });

  it('shows the length of a path', () => {
    render(
      <PropertiesPanel
        properties={{ kind: 'path', id: 'p1', surface: 'gravel', lengthM: 12.345, points: 3 }}
        strings={TEST_STRINGS}
        {...handlers()}
      />,
    );
    expect(screen.getByText('12.35 m')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Gravel path' })).toBeDefined();
  });
});
