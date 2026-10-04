// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingToolbar } from './FloatingToolbar.js';
import { Hints } from './Hints.js';
import { noticeText, placingText, reasonText } from './reason-text.js';
import { ShortcutsSheet } from './ShortcutsSheet.js';
import { SmallScreenNotice } from './SmallScreenNotice.js';
import { TEST_STRINGS } from './test-strings.js';
import { ToolBar } from './ToolBar.js';

afterEach(cleanup);

describe('Hints', () => {
  it('shows the camera hint on the first visit with an icon-only Dismiss button', () => {
    const onDismiss = vi.fn();
    render(
      <Hints
        hints={{ camera: 'pending', path: 'pending' }}
        toolKind="select"
        strings={TEST_STRINGS}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('Drag to turn, scroll to zoom')).toBeDefined();
    expect(screen.queryByText('Click points, then press Enter')).toBeNull();
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss.textContent).toBe('');
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledWith('camera');
  });

  it('shows the path hint only once the path tool is active and still pending', () => {
    const { rerender } = render(
      <Hints
        hints={{ camera: 'dismissed', path: 'pending' }}
        toolKind="select"
        strings={TEST_STRINGS}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText('Click points, then press Enter')).toBeNull();
    rerender(
      <Hints
        hints={{ camera: 'dismissed', path: 'pending' }}
        toolKind="path"
        strings={TEST_STRINGS}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Click points, then press Enter')).toBeDefined();
  });

  it('renders nothing once both hints are dismissed', () => {
    const { container } = render(
      <Hints
        hints={{ camera: 'dismissed', path: 'dismissed' }}
        toolKind="path"
        strings={TEST_STRINGS}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('SmallScreenNotice', () => {
  it('explains the desktop limit and links to voting', () => {
    render(<SmallScreenNotice strings={TEST_STRINGS} votingHref="/projects/p1" />);
    expect(screen.getByRole('heading', { name: 'Use a bigger screen' })).toBeDefined();
    expect(screen.getByText('The editor needs a desktop.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Vote instead' }).getAttribute('href')).toBe(
      '/projects/p1',
    );
  });
});

describe('ToolBar', () => {
  function renderBar() {
    const props = {
      strings: TEST_STRINGS,
      tool: 'path' as const,
      snap: 'on' as const,
      itemsList: 'hidden' as const,
      showTerraform: 'no' as const,
      onTool: vi.fn(),
      onSnap: vi.fn(),
      onItemsList: vi.fn(),
      onShortcuts: vi.fn(),
    };
    render(<ToolBar {...props} />);
    return props;
  }

  it('marks the active tool and switches tools', () => {
    const props = renderBar();
    expect(screen.getByRole('button', { name: 'Path' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Area' }));
    expect(props.onTool).toHaveBeenCalledWith('area');
  });

  it('draws a pressed tool with a dark 2 px edge, distinct from the blue focus ring', () => {
    renderBar();
    const path = screen.getByRole('button', { name: 'Path' });
    expect(path.getAttribute('style')).toContain(
      'var(--layout-border-width-medium) solid var(--surface-color-border-dark)',
    );
    expect(path.getAttribute('style')).not.toContain('--surface-color-border-active');
    expect(path.style.font).toBe('var(--typography-bold-small-body)');
    const area = screen.getByRole('button', { name: 'Area' });
    expect(area.getAttribute('aria-pressed')).toBe('false');
    expect(area.getAttribute('style')).not.toContain('--surface-color-border-dark');
  });

  it('toggles snap, the items list and the shortcuts sheet', () => {
    const props = renderBar();
    const snap = screen.getByRole('button', { name: 'Snap to grid' });
    expect(snap.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Hold Alt to turn off')).toBeDefined();
    fireEvent.click(snap);
    expect(props.onSnap).toHaveBeenCalledWith('off');
    fireEvent.click(screen.getByRole('button', { name: 'Items list' }));
    expect(props.onItemsList).toHaveBeenCalledWith('shown');
    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }));
    expect(props.onShortcuts).toHaveBeenCalled();
  });
});

describe('ShortcutsSheet', () => {
  it('lists every shortcut when open and closes', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ShortcutsSheet state="open" strings={TEST_STRINGS} onClose={onClose} />,
    );
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeDefined();
    expect(screen.getByText('key toolPath')).toBeDefined();
    expect(screen.getByText('do camera')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<ShortcutsSheet state="closed" strings={TEST_STRINGS} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('draws each key in BC Sans bold inside a 1 px box, with no monospace face', () => {
    render(<ShortcutsSheet state="open" strings={TEST_STRINGS} onClose={vi.fn()} />);
    const key = screen.getByText('key toolPath');
    expect(key.tagName).toBe('KBD');
    expect(key.style.font).toBe('var(--typography-bold-small-body)');
    expect(key.getAttribute('style')).toContain(
      'var(--layout-border-width-small) solid var(--surface-color-border-default)',
    );
  });

  it('is a modal dialog that moves focus in and closes on Esc', () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet state="open" strings={TEST_STRINGS} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('returns focus to the opener when it closes', () => {
    function Host({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="opener">
            Shortcuts
          </button>
          <ShortcutsSheet
            state={open ? 'open' : 'closed'}
            strings={TEST_STRINGS}
            onClose={vi.fn()}
          />
        </>
      );
    }
    const { rerender } = render(<Host open={false} />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    rerender(<Host open />);
    expect(document.activeElement).not.toBe(opener);
    rerender(<Host open={false} />);
    expect(document.activeElement).toBe(opener);
  });
});

describe('FloatingToolbar', () => {
  // jsdom has no PointerEvent; a MouseEvent subclass carries clientX the same way.
  if (!('PointerEvent' in window)) {
    Object.defineProperty(window, 'PointerEvent', { value: class extends MouseEvent {} });
  }

  it('rotates by drag on the handle, and duplicates and deletes', () => {
    const props = {
      strings: TEST_STRINGS,
      onRotateDrag: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
    };
    render(<FloatingToolbar {...props} />);
    const rotate = screen.getByRole('button', { name: 'Rotate' });
    fireEvent.pointerDown(rotate, { clientX: 100 });
    fireEvent.pointerUp(rotate, { clientX: 145 });
    expect(props.onRotateDrag).toHaveBeenCalledWith(45);
    fireEvent.keyDown(rotate, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onRotateDrag).toHaveBeenLastCalledWith(0);
    expect(props.onDuplicate).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
  });
});

describe('reason and notice text', () => {
  it('names the blocking thing in the ghost reason', () => {
    expect(reasonText({ valid: true }, TEST_STRINGS)).toBeNull();
    expect(reasonText({ valid: false, reason: 'too steep', label: 'swings' }, TEST_STRINGS)).toBe(
      'Too steep for Swing set',
    );
    expect(
      reasonText(
        { valid: false, reason: 'forbidden zone', label: 'Utility corridor' },
        TEST_STRINGS,
      ),
    ).toBe('Inside Utility corridor');
    expect(reasonText({ valid: false, reason: 'outside park', label: 'bench' }, TEST_STRINGS)).toBe(
      'Outside the park',
    );
  });

  it('names the item being placed and how to stop, and nothing for other tools', () => {
    expect(placingText({ kind: 'place', catalogId: 'bench' }, TEST_STRINGS)).toBe(
      'Placing Bench. Press Esc to stop.',
    );
    expect(placingText({ kind: 'select' }, TEST_STRINGS)).toBeNull();
  });

  it('writes each notice', () => {
    const nameOf = () => 'Old oak';
    expect(noticeText(null, TEST_STRINGS, nameOf)).toBeNull();
    expect(noticeText({ kind: 'locked', id: 'x' }, TEST_STRINGS, nameOf)).toBe('Old oak is locked');
    expect(noticeText({ kind: 'area-too-small', minAreaM2: 40 }, TEST_STRINGS, nameOf)).toBe(
      'Needs 40 m2',
    );
    expect(noticeText({ kind: 'path-too-short' }, TEST_STRINGS, nameOf)).toBe('Needs 2 points');
  });
});
