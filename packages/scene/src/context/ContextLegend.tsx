import type { CSSProperties, ReactElement } from 'react';

import type { ContextFeatureKind } from '@parkshape/core';

import type { ContextLayerStrings } from './context-strings.js';
import type { ContextVisibility } from './layer-plan.js';

export interface ContextLegendProps {
  readonly strings: ContextLayerStrings;
  readonly visible: ContextVisibility;
}

// Legend rows in the order the menu lists them.
const LEGEND_ORDER: readonly ContextFeatureKind[] = [
  'street',
  'sidewalk',
  'busStop',
  'bikeway',
  'parking',
];

const swatchBase: CSSProperties = {
  display: 'inline-block',
  inlineSize: '1rem',
  blockSize: '0.5rem',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-dark)',
  flexShrink: 0,
};

// Each swatch uses the same token the 3D layer reads, so the key matches the scene.
const SWATCHES: Readonly<Record<ContextFeatureKind, CSSProperties>> = {
  street: { ...swatchBase, background: 'var(--theme-gray-60)' },
  sidewalk: { ...swatchBase, background: 'var(--theme-gray-30)' },
  busStop: {
    ...swatchBase,
    inlineSize: '0.5rem',
    borderRadius: '50%',
    background: 'var(--theme-blue-70)',
  },
  bikeway: {
    ...swatchBase,
    background:
      'repeating-linear-gradient(90deg, var(--theme-blue-70) 0 0.25rem, transparent 0.25rem 0.5rem)',
  },
  parking: {
    ...swatchBase,
    background:
      'repeating-linear-gradient(45deg, var(--theme-gray-80) 0 0.125rem, transparent 0.125rem 0.3rem)',
  },
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 'var(--layout-padding-medium)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--layout-margin-small) var(--layout-margin-medium)',
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
};
const rowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--layout-margin-xsmall)',
};

/** A swatch and one or two words for each context layer that is on; no heading. */
export function ContextLegend({ strings, visible }: ContextLegendProps): ReactElement | null {
  const shown = LEGEND_ORDER.filter((kind) => visible[kind] === 'on');
  if (shown.length === 0) return null;
  return (
    <ul style={listStyle} aria-label={strings.menu} data-context-legend="">
      {shown.map((kind) => (
        <li key={kind} style={rowStyle}>
          <span aria-hidden="true" style={SWATCHES[kind]} />
          {strings.legend[kind]}
        </li>
      ))}
    </ul>
  );
}
