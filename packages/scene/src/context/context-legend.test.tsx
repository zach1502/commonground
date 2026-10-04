// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import { TEST_STRINGS } from '../editor-components/test-strings.js';

import { ContextLegend } from './ContextLegend.js';

const strings = TEST_STRINGS.layers;

afterEach(cleanup);

const rowsShown = () => screen.getAllByRole('listitem').map((row) => row.textContent);

describe('ContextLegend', () => {
  it('shows a swatch and a word or two for each layer that is on, with no heading', () => {
    render(<ContextLegend strings={strings} visible={CONTEXT_LAYER_DEFAULTS} />);
    expect(rowsShown()).toEqual(['Street', 'Sidewalk', 'Bus stop']);
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    const words = rowsShown().join(' ').split(/\s+/).length;
    expect(words).toBe(4);
  });

  it('adds a row when parking is turned on', () => {
    render(
      <ContextLegend strings={strings} visible={{ ...CONTEXT_LAYER_DEFAULTS, parking: 'on' }} />,
    );
    expect(rowsShown()).toContain('Parking');
  });

  it('draws nothing with every layer off', () => {
    const off = {
      street: 'off',
      sidewalk: 'off',
      busStop: 'off',
      parking: 'off',
      bikeway: 'off',
    } as const;
    const { container } = render(<ContextLegend strings={strings} visible={off} />);
    expect(container.textContent).toBe('');
  });
});
