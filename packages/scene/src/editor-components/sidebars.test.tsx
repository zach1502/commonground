// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { contextFor } from '../editor/actions/test-context.js';
import { docOf, square, treeInput } from '../editor/test-fixtures.js';

import { CanvasOverlays, DetailsSidebar, PlacingLine, ToolsSidebar } from './Sidebars.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

const doc = docOf({
  items: [treeInput('t1', 10, 10), treeInput('old', 30, 30, 'locked')],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: square(40, 0, 10), locked: false }],
});

describe('ToolsSidebar', () => {
  it('starts placing from the palette and shows the tool hint', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Seating' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bench, $3,500' }));
    expect(ctx.store.getState().tool).toEqual({ kind: 'place', catalogId: 'bench' });
    const bench = screen.getByRole('option', { name: 'Bench, $3,500' });
    expect(bench.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Path' }));
    expect(screen.getByRole('status').textContent).toBe('Click to add points');
    const gravel = screen.getByRole('option', { name: /^Gravel path/ });
    expect(gravel.getAttribute('aria-selected')).toBe('true');
  });

  it('pins the tool row, so the palette scrolls beneath it', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    const row = screen.getByRole('toolbar', { name: 'Tools' }).closest('[data-tool-row]');
    expect(row).not.toBeNull();
    expect((row as HTMLElement).style.position).toBe('sticky');
    expect((row as HTMLElement).style.top).toBe('0px');
  });

  it('names a locked item in the notice line', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    act(() => {
      ctx.store.getState().setNotice({ kind: 'locked', id: 'old' });
    });
    expect(screen.getByRole('status').textContent).toBe('Bigleaf maple is locked');
  });

  it('toggles snap, the Items list and the shortcuts sheet', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Snap to grid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Items list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paint mode' }));
    const state = ctx.store.getState();
    expect([state.snap, state.itemsList, state.shortcuts, state.paint]).toEqual([
      'off',
      'shown',
      'open',
      'on',
    ]);
  });
});

describe('ToolsSidebar terraform', () => {
  it('shows the terraform tool only when the feature is on and selects it', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} features={{ terraform: 'on' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terraform' }));
    expect(ctx.store.getState().tool).toEqual({ kind: 'terraform' });
  });

  it('folds the palette under a closed disclosure while terraforming', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} features={{ terraform: 'on' }} />);
    expect(screen.getByRole('listbox', { name: 'Plants' }).closest('details')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Terraform' }));
    const fold = screen.getByText('Fold add', { selector: 'summary' }).closest('details');
    expect(fold).not.toBeNull();
    expect(fold?.open).toBe(false);
    expect(screen.getByRole('listbox', { name: 'Plants', hidden: true }).closest('details')).toBe(
      fold,
    );
  });

  it('hides the terraform tool by default', () => {
    const ctx = contextFor(doc);
    render(<ToolsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.queryByRole('button', { name: 'Terraform' })).toBeNull();
  });
});

describe('DetailsSidebar follows the mode', () => {
  it('drops properties while placing, so the meters move up', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
  });

  it('shows only the brush while terraforming', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setTool({ kind: 'terraform' });
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.getByRole('region', { name: 'Terraform' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
  });

  it('shows properties while selecting', () => {
    const ctx = contextFor(doc);
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.getByRole('region', { name: 'Properties' })).toBeDefined();
  });
});

describe('DetailsSidebar', () => {
  it('shows the terraform controls with the live readout when the tool is active', () => {
    const ctx = contextFor(doc);
    act(() => {
      ctx.store.getState().setTool({ kind: 'terraform' });
    });
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.getByRole('region', { name: 'Terraform' })).toBeDefined();
    expect(screen.getByText('Cut: 0 m³')).toBeDefined();
  });

  it('edits the selected item from the properties panel', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    const east = screen.getByLabelText('East (m)');
    fireEvent.change(east, { target: { value: '12' } });
    fireEvent.blur(east);
    const rotation = screen.getByLabelText('Rotation (degrees)');
    fireEvent.change(rotation, { target: { value: '45' } });
    fireEvent.blur(rotation);
    expect(ctx.store.getState().document.items[0]).toMatchObject({
      position: { x: 12, y: 10 },
      rotationDeg: 45,
    });
  });

  it('starts Add corner for a selected area', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().select([{ kind: 'area', id: 'a1' }], 'replace');
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add corner' }));
    expect(ctx.store.getState().tool).toEqual({ kind: 'add-corner', areaId: 'a1' });
  });

  it('places, selects, nudges and deletes from the Items list by keyboard', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setItemsList('shown');
    render(<DetailsSidebar ctx={ctx} strings={TEST_STRINGS} />);
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'bench' } });
    const [addEast] = screen.getAllByLabelText('East (m)');
    const [addNorth] = screen.getAllByLabelText('North (m)');
    if (addEast === undefined || addNorth === undefined) throw new Error('form');
    fireEvent.change(addEast, { target: { value: '20' } });
    fireEvent.change(addNorth, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(ctx.store.getState().document.items).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'North' }));
    expect(ctx.store.getState().document.items[2]?.position).toEqual({ x: 20, y: 5.5 });
    fireEvent.click(screen.getByRole('button', { name: /^Bigleaf maple 10, 10/ }));
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: 't1' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bigleaf maple' }));
    expect(ctx.store.getState().document.items).toHaveLength(2);
  });
});

describe('CanvasOverlays', () => {
  it('shows the camera hint on the first visit and dismisses it on the Dismiss button', () => {
    const ctx = contextFor(doc);
    render(<CanvasOverlays ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.getByText('Drag to turn, scroll to zoom')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(ctx.store.getState().hints.camera).toBe('dismissed');
    expect(screen.queryByText('Drag to turn, scroll to zoom')).toBeNull();
  });

  it('says what is being placed and how to stop, and nothing when not placing', () => {
    const ctx = contextFor(doc);
    render(<PlacingLine ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.queryByText(/^Placing/)).toBeNull();
    act(() => {
      ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    });
    expect(screen.getByRole('status')).toHaveProperty(
      'textContent',
      'Placing Bench. Press Esc to stop.',
    );
    act(() => {
      ctx.store.getState().setTool({ kind: 'select' });
    });
    expect(screen.queryByText(/^Placing/)).toBeNull();
  });

  it('sets the placing line on one line at the top of the canvas', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    render(<PlacingLine ctx={ctx} strings={TEST_STRINGS} />);
    const line = screen.getByRole('status');
    const anchor = line.closest<HTMLElement>('[data-canvas-line]');
    expect(anchor?.style.position).toBe('absolute');
    expect(anchor?.style.insetBlockStart).toBe('var(--layout-margin-medium)');
    expect(anchor?.style.insetBlockEnd).toBe('');
    expect(line.style.whiteSpace).toBe('nowrap');
  });

  it('keeps the placing line out of the bottom overlay stack', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    render(<CanvasOverlays ctx={ctx} strings={TEST_STRINGS} />);
    expect(screen.queryByText(/^Placing/)).toBeNull();
  });

  it('closes the shortcuts sheet', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setShortcuts('open');
    render(<CanvasOverlays ctx={ctx} strings={TEST_STRINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(ctx.store.getState().shortcuts).toBe('closed');
  });
});

describe('DetailsSidebar Items list', () => {
  it('puts the Items list first in the column, above properties and the meters', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setItemsList('shown');
    render(
      <DetailsSidebar ctx={ctx} strings={TEST_STRINGS}>
        <section aria-label="Design targets">meters</section>
      </DetailsSidebar>,
    );
    const list = screen.getByRole('region', { name: 'Items' });
    const meters = screen.getByRole('region', { name: 'Design targets' });
    expect(list.compareDocumentPosition(meters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
