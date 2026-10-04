import type { CSSProperties } from 'react';

import {
  badgeStyle,
  buttonStyle,
  listStyle,
  pressedButtonStyle,
  rowStyle,
  subheadingStyle,
} from './styles.js';

/**
 * The Items list is one grid: a name column and a status column, grouped under category
 * headings that carry the category and its count. Each row and group heading
 * spans the grid and takes its columns through subgrid, so every row lines up like a table.
 */
export const gridStyle: CSSProperties = {
  ...listStyle,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  columnGap: 'var(--layout-margin-small)',
  rowGap: 0,
};

export const itemStyle: CSSProperties = {
  display: 'grid',
  gridColumn: '1 / -1',
  gridTemplateColumns: 'subgrid',
};

const spanStyle: CSSProperties = { gridColumn: '1 / -1' };

/** A 32 px ruled line; no box around the row or its name. */
export const lineStyle: CSSProperties = {
  ...spanStyle,
  display: 'grid',
  gridTemplateColumns: 'subgrid',
  alignItems: 'center',
  minBlockSize: 'var(--layout-padding-xlarge)',
  borderBlockEnd: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
};

/** The selected row: the light fill and the 2 px dark edge of a pressed tool, drawn inside. */
export const selectedLineStyle: CSSProperties = {
  ...lineStyle,
  background: pressedButtonStyle.background,
  outline: pressedButtonStyle.border,
  outlineOffset: 'calc(-1 * var(--layout-border-width-medium))',
};

/** The name reads as text in the row; the transparent edge keeps the focus ring in place. */
export const nameButtonStyle: CSSProperties = {
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  textAlign: 'start',
  background: 'transparent',
  border: 'var(--layout-border-width-small) solid transparent',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: 'var(--layout-padding-hair) var(--layout-padding-xsmall)',
  minBlockSize: 'var(--layout-padding-large)',
  inlineSize: '100%',
  cursor: 'pointer',
};

export const selectedNameStyle: CSSProperties = {
  ...nameButtonStyle,
  font: 'var(--typography-bold-small-body)',
};

export const tagStyle: CSSProperties = badgeStyle;

export const compactButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: 'var(--layout-padding-hair) var(--layout-padding-small)',
};

/** The selected row's actions and nudges, on a second line under its name. */
export const toolsStyle: CSSProperties = {
  ...spanStyle,
  ...rowStyle,
  paddingBlock: 'var(--layout-padding-xsmall)',
  paddingInline: 'var(--layout-padding-xsmall)',
};

export const groupHeadingStyle: CSSProperties = {
  ...subheadingStyle,
  ...spanStyle,
  display: 'flex',
  gap: 'var(--layout-margin-small)',
  paddingBlock: 'var(--layout-padding-small) var(--layout-padding-hair)',
  borderBlockEnd: 'var(--layout-border-width-small) solid var(--surface-color-border-dark)',
};

export const countStyle: CSSProperties = {
  font: 'var(--typography-regular-small-body)',
  fontVariantNumeric: 'tabular-nums',
};
