import type { CSSProperties, ReactElement } from 'react';

import type { HintId, HintsState } from '../editor/hints.js';
import type { Tool } from '../editor/store/types.js';
import { FADE } from '../motion/panel-motion.js';
import { usePresence, type Shown } from '../motion/use-presence.js';

import type { EditorStrings } from './strings.js';
import { floatingStyle } from './styles.js';

export interface HintsProps {
  readonly hints: HintsState;
  readonly toolKind: Tool['kind'];
  readonly strings: EditorStrings;
  readonly onDismiss: (id: HintId) => void;
}

// The card floats over the ground and never blocks a click; only the Dismiss button takes one.
const cardStyle: CSSProperties = {
  ...floatingStyle,
  position: 'absolute',
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  alignItems: 'center',
  pointerEvents: 'none',
};

const cameraStyle: CSSProperties = { ...cardStyle, insetBlockEnd: 'var(--layout-margin-large)' };
const pathStyle: CSSProperties = { ...cardStyle, insetBlockStart: 'var(--layout-margin-large)' };

const textStyle: CSSProperties = {
  margin: 0,
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
};

const dismissStyle: CSSProperties = {
  display: 'inline-flex',
  padding: 0,
  background: 'none',
  border: 'none',
  color: 'var(--typography-color-secondary)',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

const ICON_SIZE = 16;

interface HintProps {
  readonly id: HintId;
  readonly shown: Shown;
  readonly text: string;
  readonly dismissLabel: string;
  readonly style: CSSProperties;
  readonly onDismiss: (id: HintId) => void;
}

const ENTER_ON_MOUNT = { onMount: 'enter' } as const;

/** One hint: it fades in when it is due and fades out once the move is made or it is dismissed. */
function Hint({ id, shown, text, dismissLabel, style, onDismiss }: HintProps): ReactElement | null {
  const presence = usePresence<HTMLDivElement>(shown, FADE, ENTER_ON_MOUNT);
  if (presence.mounted === 'unmounted') return null;
  return (
    <div ref={presence.ref} data-hint={id} style={style} {...presence.leaving}>
      <p style={textStyle}>{text}</p>
      <button
        type="button"
        aria-label={dismissLabel}
        style={dismissStyle}
        onClick={() => {
          onDismiss(id);
        }}
      >
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}

/** First-visit hints for the two moves that the affordances do not already show. */
export function Hints({ hints, toolKind, strings, onDismiss }: HintsProps): ReactElement {
  const showPath = hints.path === 'pending' && toolKind === 'path';
  return (
    <>
      <Hint
        id="camera"
        shown={hints.camera === 'pending' ? 'shown' : 'hidden'}
        text={strings.hints.camera}
        dismissLabel={strings.hints.dismiss}
        style={cameraStyle}
        onDismiss={onDismiss}
      />
      <Hint
        id="path"
        shown={showPath ? 'shown' : 'hidden'}
        text={strings.hints.path}
        dismissLabel={strings.hints.dismiss}
        style={pathStyle}
        onDismiss={onDismiss}
      />
    </>
  );
}
