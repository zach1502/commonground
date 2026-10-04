// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import type { ContextLayerInput } from '../../context/ContextLayer.js';
import type {
  ContextLayersMenuState,
  EditorContextLayers,
} from '../../context/use-editor-context-layers.js';
import { contextFor } from '../../editor/actions/test-context.js';
import { docOf, treeInput } from '../../editor/test-fixtures.js';
import { TEST_STRINGS } from '../test-strings.js';

import { ParkEditor } from './ParkEditor.js';

// The canvas needs WebGL; the legend test reads only the columns around it.
vi.mock('./EditorCanvas.js', () => {
  const EditorCanvas = () => null;
  return { EditorCanvas };
});

const layers = vi.hoisted(() => ({ current: undefined as EditorContextLayers | undefined }));
vi.mock('../../context/use-editor-context-layers.js', () => ({
  useEditorContextLayers: () => layers.current,
}));

afterEach(cleanup);

const doc = docOf({ items: [treeInput('t1', 10, 10)] });

function renderEditor(menu: ContextLayersMenuState) {
  const layer = { visible: menu.visible } as unknown as ContextLayerInput;
  layers.current = { layer, menu };
  render(<ParkEditor ctx={contextFor(doc)} strings={TEST_STRINGS} />);
  return screen.getByRole('complementary', { name: TEST_STRINGS.properties.heading });
}

const menuOn: ContextLayersMenuState = {
  status: 'ready',
  visible: CONTEXT_LAYER_DEFAULTS,
  onToggle: vi.fn(),
};

describe('ParkEditor map layers legend', () => {
  it('sits at the top of the right column, outside the Properties section', () => {
    const column = renderEditor(menuOn);
    const legend = within(column).getByRole('list', { name: TEST_STRINGS.layers.menu });
    const properties = within(column).getByRole('region', {
      name: TEST_STRINGS.properties.heading,
    });
    expect(properties.contains(legend)).toBe(false);
    expect(column.firstElementChild).toBe(legend);
  });

  it('draws no legend while every layer is off', () => {
    const off = {
      street: 'off',
      sidewalk: 'off',
      busStop: 'off',
      parking: 'off',
      bikeway: 'off',
    } as const;
    const column = renderEditor({ ...menuOn, visible: off });
    expect(within(column).queryByRole('list', { name: TEST_STRINGS.layers.menu })).toBeNull();
  });
});
