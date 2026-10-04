import type { CSSProperties } from 'react';

export const toolbarStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: 'var(--layout-margin-medium)',
  insetBlockStart: 'var(--layout-margin-medium)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--layout-margin-medium)',
};

export const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--layout-margin-small)',
};

export const buttonStyle: CSSProperties = {
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-white)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-medium)',
  padding: 'var(--layout-padding-xsmall) var(--layout-padding-small)',
  // WCAG 2.5.8: every HUD control keeps a 24 by 24 px hit area, even an icon-only one.
  minBlockSize: '1.5rem',
  minInlineSize: '1.5rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

export const pressedButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: 'var(--typography-color-primary-invert)',
  background: 'var(--surface-color-primary-button-default)',
};

export const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  padding: 'var(--layout-padding-large)',
  background: 'var(--surface-color-background-light-gray)',
  font: 'var(--typography-regular-body)',
  color: 'var(--typography-color-primary)',
};

export const progressTrackStyle: CSSProperties = {
  inlineSize: '100%',
  maxInlineSize: '24rem',
  blockSize: 'var(--layout-padding-xsmall)',
  background: 'var(--theme-gray-30)',
};
