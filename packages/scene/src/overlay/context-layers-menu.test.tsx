// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import { TEST_STRINGS } from '../editor-components/test-strings.js';

import { ContextLayersMenu } from './ContextLayersMenu.js';

const strings = TEST_STRINGS.layers;

afterEach(cleanup);

function open() {
  const button = screen.getByRole('button', { name: 'Map layers' });
  fireEvent.click(button);
  return button;
}

describe('ContextLayersMenu', () => {
  it('is one icon button named "Map layers" with a tooltip, closed at first', () => {
    render(
      <ContextLayersMenu
        strings={strings}
        status="ready"
        visible={CONTEXT_LAYER_DEFAULTS}
        onToggle={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Map layers' });
    expect(button.getAttribute('title')).toBe('Map layers');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('opens 5 boxes with streets, sidewalks and bus stops ticked', () => {
    render(
      <ContextLayersMenu
        strings={strings}
        status="ready"
        visible={CONTEXT_LAYER_DEFAULTS}
        onToggle={vi.fn()}
      />,
    );
    expect(open().getAttribute('aria-expanded')).toBe('true');
    const boxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.map((box) => box.labels?.[0]?.textContent)).toEqual([
      'Streets',
      'Sidewalks',
      'Bus stops',
      'Bike routes',
      'Parking',
    ]);
    expect(boxes.filter((box) => box.checked)).toHaveLength(3);
  });
});

describe('ContextLayersMenu when open', () => {
  it('reports the layer a box turns on', () => {
    const onToggle = vi.fn();
    render(
      <ContextLayersMenu
        strings={strings}
        status="ready"
        visible={CONTEXT_LAYER_DEFAULTS}
        onToggle={onToggle}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Parking' }));
    expect(onToggle).toHaveBeenCalledWith('parking');
  });

  it('closes on Esc and puts focus back on the button', () => {
    render(
      <ContextLayersMenu
        strings={strings}
        status="ready"
        visible={CONTEXT_LAYER_DEFAULTS}
        onToggle={vi.fn()}
      />,
    );
    const button = open();
    const box = screen.getByRole('checkbox', { name: 'Streets' });
    box.focus();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.activeElement).toBe(button);
  });

  it('says the street data did not load in place of the boxes', () => {
    render(
      <ContextLayersMenu
        strings={strings}
        status="failed"
        visible={CONTEXT_LAYER_DEFAULTS}
        onToggle={vi.fn()}
      />,
    );
    open();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText(strings.failed)).toBeDefined();
  });
});
