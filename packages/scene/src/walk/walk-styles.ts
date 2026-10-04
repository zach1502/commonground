import type { CSSProperties } from 'react';

import { buttonStyle } from '../overlay/styles.js';

/** DESIGN.md "Walk": the "you are here" map is 120 px square. */
export const INSET_SIZE_PX = 120;

export const layerStyle: CSSProperties = { position: 'absolute', inset: 0 };

export const surfaceStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  // The page must not scroll or zoom under a drag; the walk reads the pointer itself.
  touchAction: 'none',
  cursor: 'grab',
  outlineOffset: 'calc(var(--layout-border-width-medium) * -2)',
};

export const primaryWalkButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: 'var(--typography-color-primary-invert)',
  background: 'var(--surface-color-primary-button-default)',
  borderColor: 'var(--surface-color-primary-button-default)',
};

export const hintStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: 'var(--layout-margin-medium)',
  insetBlockEnd: 'var(--layout-margin-medium)',
  maxInlineSize: '28rem',
  margin: 0,
  padding: 'var(--layout-padding-xsmall) var(--layout-padding-small)',
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-white)',
  borderRadius: 'var(--layout-border-radius-medium)',
  pointerEvents: 'none',
};

export const insetStyle: CSSProperties = {
  position: 'absolute',
  insetInlineEnd: 'var(--layout-margin-medium)',
  insetBlockEnd: 'var(--layout-margin-medium)',
  inlineSize: `${String(INSET_SIZE_PX)}px`,
  blockSize: `${String(INSET_SIZE_PX)}px`,
  background: 'var(--surface-color-background-white)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-medium)',
  pointerEvents: 'none',
};

/** Read by screen readers, not drawn. */
export const liveRegionStyle: CSSProperties = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** The walk pad is 112 px across, its knob 48 px: both well over the 44 px touch target. */
export const PAD_SIZE_PX = 112;
const HALF = 0.5;
export const KNOB_SIZE_PX = 48;

export const padStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: 'var(--layout-margin-medium)',
  insetBlockEnd: 'var(--layout-margin-medium)',
  inlineSize: `${String(PAD_SIZE_PX)}px`,
  blockSize: `${String(PAD_SIZE_PX)}px`,
  borderRadius: '50%',
  background: 'color-mix(in srgb, var(--surface-color-background-white) 70%, transparent)',
  border: 'var(--layout-border-width-medium) solid var(--surface-color-border-dark)',
  touchAction: 'none',
};

export function knobStyle(offset: { readonly x: number; readonly y: number }): CSSProperties {
  const centre = (PAD_SIZE_PX - KNOB_SIZE_PX) * HALF;
  return {
    position: 'absolute',
    insetInlineStart: `${String(centre + offset.x)}px`,
    insetBlockStart: `${String(centre + offset.y)}px`,
    inlineSize: `${String(KNOB_SIZE_PX)}px`,
    blockSize: `${String(KNOB_SIZE_PX)}px`,
    borderRadius: '50%',
    background: 'var(--surface-color-primary-button-default)',
    pointerEvents: 'none',
  };
}

/** On a touch screen the hint sits above the walk pad. */
export const touchHintStyle: CSSProperties = {
  ...hintStyle,
  insetBlockEnd: `calc(${String(PAD_SIZE_PX)}px + var(--layout-margin-medium) * 2)`,
};
