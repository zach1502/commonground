import { useId } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { EditorStrings } from './strings.js';
import { buttonStyle, helpStyle, pressedButtonStyle, rowStyle } from './styles.js';

export type ToolKind = 'select' | 'path' | 'area' | 'terraform';

export interface ToolBarProps {
  readonly strings: EditorStrings;
  readonly tool: ToolKind | 'other';
  readonly snap: 'on' | 'off';
  readonly itemsList: 'shown' | 'hidden';
  /** The terraform tool appears only when the feature flag is on. */
  readonly showTerraform: 'yes' | 'no';
  readonly onTool: (tool: ToolKind) => void;
  readonly onSnap: (snap: 'on' | 'off') => void;
  readonly onItemsList: (itemsList: 'shown' | 'hidden') => void;
  readonly onShortcuts: () => void;
}

interface ToggleProps {
  readonly label: string;
  readonly pressed: 'on' | 'off';
  readonly onClick: () => void;
  readonly describedBy?: string;
  /** Extra style for a toggle joined to its neighbours in the tool row. */
  readonly joined?: CSSProperties;
}

function Toggle({ label, pressed, onClick, describedBy, joined }: ToggleProps): ReactElement {
  const style = pressed === 'on' ? pressedButtonStyle : buttonStyle;
  return (
    <button
      type="button"
      aria-pressed={pressed === 'on'}
      aria-describedby={describedBy}
      style={joined === undefined ? style : { ...style, ...joined }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Snap to the 0.5 m grid; holding Alt turns it off while you drag. */
export function SnapToggle(props: Pick<ToolBarProps, 'strings' | 'snap' | 'onSnap'>): ReactElement {
  const id = useId();
  return (
    <span style={rowStyle}>
      <Toggle
        label={props.strings.tools.snap}
        pressed={props.snap}
        describedBy={id}
        onClick={() => {
          props.onSnap(props.snap === 'on' ? 'off' : 'on');
        }}
      />
      <span id={id} style={helpStyle}>
        {props.strings.tools.snapHelp}
      </span>
    </span>
  );
}

const BASE_TOOLS: readonly ToolKind[] = ['select', 'path', 'area'];

/**
 * The tools are one choice, so they sit joined in one group, like a segmented control. With no
 * gaps, a pressed tool's bold label still fits beside the other three in the full-page editor.
 * A narrower tools column, in a window under about 1360 px, wraps the group.
 */
const toolRowStyle: CSSProperties = { display: 'inline-flex', flexWrap: 'wrap' };

function joinedStyle(index: number, count: number, pressed: 'on' | 'off'): CSSProperties {
  return {
    position: 'relative',
    ...(pressed === 'on' ? { zIndex: 1 } : {}),
    ...(index === 0 ? {} : { marginInlineStart: 'calc(-1 * var(--layout-border-width-small))' }),
    ...(index === 0 ? {} : { borderStartStartRadius: 0, borderEndStartRadius: 0 }),
    ...(index === count - 1 ? {} : { borderStartEndRadius: 0, borderEndEndRadius: 0 }),
  };
}

export function ToolBar(props: ToolBarProps): ReactElement {
  const { strings } = props;
  const tools = props.showTerraform === 'yes' ? [...BASE_TOOLS, 'terraform' as const] : BASE_TOOLS;
  return (
    <div role="toolbar" aria-label={strings.tools.label} style={rowStyle}>
      <span style={toolRowStyle}>
        {tools.map((tool, index) => {
          const pressed = props.tool === tool ? 'on' : 'off';
          return (
            <Toggle
              key={tool}
              label={strings.tools[tool]}
              pressed={pressed}
              joined={joinedStyle(index, tools.length, pressed)}
              onClick={() => {
                props.onTool(tool);
              }}
            />
          );
        })}
      </span>
      <SnapToggle strings={strings} snap={props.snap} onSnap={props.onSnap} />
      <Toggle
        label={strings.tools.itemsList}
        pressed={props.itemsList === 'shown' ? 'on' : 'off'}
        onClick={() => {
          props.onItemsList(props.itemsList === 'shown' ? 'hidden' : 'shown');
        }}
      />
      <button type="button" style={buttonStyle} onClick={props.onShortcuts}>
        {strings.tools.shortcuts}
      </button>
    </div>
  );
}
