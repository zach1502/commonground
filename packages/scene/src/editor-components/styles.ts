import type { CSSProperties } from 'react';

import { buttonStyle } from '../overlay/styles.js';

export { buttonStyle };

/**
 * A pressed toggle: a light fill, bold text and a 2 px dark edge. The edge is grey so the blue
 * focus outline stays readable on top of it, and the solid primary fill stays for the page's one
 * primary action.
 */
export const pressedButtonStyle: CSSProperties = {
  ...buttonStyle,
  font: 'var(--typography-bold-small-body)',
  background: 'var(--surface-color-background-light-blue)',
  border: 'var(--layout-border-width-medium) solid var(--surface-color-border-dark)',
};

/** A key name in BC Sans bold inside a 1 px box, so the browser's monospace face never shows. */
export const keyStyle: CSSProperties = {
  font: 'var(--typography-bold-small-body)',
  color: 'var(--typography-color-primary)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: '0 var(--layout-padding-xsmall)',
  whiteSpace: 'nowrap',
};

export const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--layout-margin-small)',
  padding: 'var(--layout-padding-medium)',
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-white)',
};

export const headingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--typography-bold-body)',
  color: 'var(--typography-color-primary)',
};

export const subheadingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--typography-bold-small-body)',
  color: 'var(--typography-color-secondary)',
};

export const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--layout-margin-xsmall)',
};

export const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--layout-margin-xsmall)',
};

export const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--layout-margin-xsmall)',
};

export const inputStyle: CSSProperties = {
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-dark)',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: 'var(--layout-padding-xsmall)',
  inlineSize: '100%',
  boxSizing: 'border-box',
};

export const helpStyle: CSSProperties = {
  margin: 0,
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-secondary)',
};

/** Floating toolbars and menus are the only surfaces with the low elevation shadow. */
export const floatingStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--layout-margin-xsmall)',
  padding: 'var(--layout-padding-xsmall)',
  background: 'var(--surface-color-background-white)',
  borderRadius: 'var(--layout-border-radius-medium)',
  boxShadow: 'var(--elevation-low)',
  whiteSpace: 'nowrap',
};

export const badgeStyle: CSSProperties = {
  font: 'var(--typography-bold-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-light-gray)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: '0 var(--layout-padding-xsmall)',
  whiteSpace: 'nowrap',
};

export const reasonStyle: CSSProperties = {
  font: 'var(--typography-bold-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--support-surface-color-danger)',
  border: 'var(--layout-border-width-small) solid var(--support-border-color-danger)',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: '0 var(--layout-padding-xsmall)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

export const noticeStyle: CSSProperties = {
  margin: 0,
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--support-surface-color-info)',
  borderInlineStart: 'var(--layout-border-width-large) solid var(--support-border-color-info)',
  padding: 'var(--layout-padding-xsmall) var(--layout-padding-small)',
};

/** The picker's tab row; the tabs wrap onto a second line in the narrow tools column. */
export const tabListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--layout-margin-xsmall)',
};

/**
 * Square picture tiles with a 2 px gap. Tiles are at least 4.5rem wide, so the widest catalog
 * word, "Community" at 4.125rem, fits on one line: 2 a row at 1024 px and 3 at 1440 px.
 */
export const tileGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(4.5rem, 1fr))',
  gap: 'var(--layout-margin-hair)',
};

// No background here: the hover and pressed fills come from the press rules, and an inline
// background would win over them.
export const tileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minInlineSize: 0,
  border: 'var(--layout-border-width-medium) solid transparent',
  borderRadius: 'var(--layout-border-radius-small)',
  cursor: 'pointer',
};

/** The tile being placed carries the 2 px selection outline in the focus colour. */
export const tileSelectedStyle: CSSProperties = {
  ...tileStyle,
  borderColor: 'var(--surface-color-border-active)',
};

export const tileImageStyle: CSSProperties = {
  display: 'block',
  inlineSize: '100%',
  aspectRatio: '1',
  objectFit: 'contain',
  background: 'var(--surface-color-background-light-gray)',
  borderRadius: 'var(--layout-border-radius-small)',
};

const oneLine: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// The label type's line height, from --typography-regular-label.
const LABEL_LINE = '1.125rem';
const NAME_LINES = 2;

/**
 * Up to two lines, broken only between words, then an ellipsis; the tile's title holds the full
 * name. Every name keeps two lines of room, so the costs in a row line up. The name runs under
 * the tile's transparent border. A word wider than the tile ends in an ellipsis, never splits.
 */
export const tileNameStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: NAME_LINES,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  overflowWrap: 'normal',
  hyphens: 'manual',
  marginInline: 'calc(-1 * var(--layout-border-width-medium))',
  minHeight: `calc(${String(NAME_LINES)} * ${LABEL_LINE})`,
  font: 'var(--typography-regular-label)',
  color: 'var(--typography-color-primary)',
};

export const tileCostStyle: CSSProperties = {
  ...oneLine,
  minHeight: LABEL_LINE,
  font: 'var(--typography-regular-label)',
  color: 'var(--typography-color-secondary)',
};
