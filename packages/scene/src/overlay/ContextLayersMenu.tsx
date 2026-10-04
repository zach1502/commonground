import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import type { ContextFeatureKind } from '@parkshape/core';

import type { ContextLayerStrings } from '../context/context-strings.js';
import type { ContextVisibility } from '../context/layer-plan.js';

import { buttonStyle } from './styles.js';

export interface ContextLayersMenuProps {
  readonly strings: ContextLayerStrings;
  /** 'failed' shows the load failure in place of the boxes. */
  readonly status: 'ready' | 'failed';
  readonly visible: ContextVisibility;
  readonly onToggle: (kind: ContextFeatureKind) => void;
}

// The order the boxes read in: the default layers first.
const MENU_ORDER: readonly ContextFeatureKind[] = [
  'street',
  'sidewalk',
  'busStop',
  'bikeway',
  'parking',
];
const ICON_PX = 16;
// Above the street names, whose drei labels stack up to z-index 10.
const MENU_LAYER = 11;

const wrapStyle = { position: 'relative' } as const;
const panelStyle = {
  position: 'absolute',
  insetBlockStart: 'calc(100% + var(--layout-margin-xsmall))',
  insetInlineStart: 0,
  zIndex: MENU_LAYER,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--layout-margin-xsmall)',
  minInlineSize: '10rem',
  padding: 'var(--layout-padding-small)',
  background: 'var(--surface-color-background-white)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-medium)',
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
} as const;
// WCAG 2.5.8: each row keeps a 24 px target.
const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--layout-margin-small)',
  minBlockSize: '1.5rem',
  cursor: 'pointer',
} as const;
const failedStyle = { margin: 0, maxInlineSize: '14rem' } as const;

/** Two stacked sheets, the usual map layers mark, drawn at the 16 px icon size. */
function LayersIcon(): ReactElement {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M10 3 2.75 7 10 11l7.25-4z" />
      <path d="m2.75 10.5 7.25 4 7.25-4M2.75 14l7.25 4 7.25-4" />
    </svg>
  );
}

function LayerBoxes({ strings, visible, onToggle }: Omit<ContextLayersMenuProps, 'status'>) {
  return (
    <>
      {MENU_ORDER.map((kind) => (
        <label key={kind} style={rowStyle}>
          <input
            type="checkbox"
            checked={visible[kind] === 'on'}
            onChange={() => {
              onToggle(kind);
            }}
          />
          {strings.kinds[kind]}
        </label>
      ))}
    </>
  );
}

/**
 * The icon-only Layers button beside the view presets. It opens the 5 layer boxes; Esc closes
 * them and puts focus back on the button.
 */
export function ContextLayersMenu(props: ContextLayersMenuProps): ReactElement {
  const { strings, status } = props;
  const [open, setOpen] = useState<'open' | 'closed'>('closed');
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // The editor's own Esc drops the tool; this one only closes the menu.
    event.stopPropagation();
    setOpen('closed');
    button.current?.focus();
  };
  return (
    <div style={wrapStyle} onKeyDown={close}>
      <button
        ref={button}
        type="button"
        style={buttonStyle}
        aria-label={strings.menu}
        title={strings.menu}
        aria-expanded={open === 'open'}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => (current === 'open' ? 'closed' : 'open'));
        }}
      >
        <LayersIcon />
      </button>
      {open === 'open' ? (
        <div id={panelId} role="group" aria-label={strings.menu} style={panelStyle}>
          {status === 'failed' ? (
            <p style={failedStyle}>{strings.failed}</p>
          ) : (
            <LayerBoxes strings={strings} visible={props.visible} onToggle={props.onToggle} />
          )}
        </div>
      ) : null}
    </div>
  );
}
