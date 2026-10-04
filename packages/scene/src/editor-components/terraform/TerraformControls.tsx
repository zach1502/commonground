import { useId } from 'react';
import type { ReactElement } from 'react';

import type { TerraformSettings } from '../../editor/store/types.js';
import type { ReadoutText } from '../../editor/terraform/readout.js';
import type { TerraformMode } from '../../editor/terraform/types.js';
import type { EditorStrings } from '../strings.js';
import { fill } from '../strings.js';
import {
  buttonStyle,
  fieldStyle,
  headingStyle,
  helpStyle,
  inputStyle,
  panelStyle,
  pressedButtonStyle,
  rowStyle,
  subheadingStyle,
} from '../styles.js';

/** Smallest and largest brush radius the slider offers, in metres. */
const RADIUS_MIN_M = 1;
const RADIUS_MAX_M = 20;
const STRENGTH_MIN = 0;
const STRENGTH_MAX = 1;
const STRENGTH_STEP = 0.05;

const MODES: readonly TerraformMode[] = ['raise', 'lower', 'smooth', 'flatten', 'level-item'];

export interface TerraformControlsProps {
  readonly strings: EditorStrings;
  readonly settings: TerraformSettings;
  readonly readout: ReadoutText;
  /** level-item needs a single selected item; otherwise its button is disabled. */
  readonly canLevelItem: 'yes' | 'no';
  readonly onSettings: (settings: TerraformSettings) => void;
}

function ModeButtons({
  strings,
  settings,
  canLevelItem,
  onSettings,
}: TerraformControlsProps): ReactElement {
  const t = strings.terraform;
  return (
    <div role="group" aria-label={t.modeLabel} style={rowStyle}>
      {MODES.map((mode) => {
        const disabled = mode === 'level-item' && canLevelItem === 'no';
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={settings.mode === mode}
            disabled={disabled}
            style={settings.mode === mode ? pressedButtonStyle : buttonStyle}
            onClick={() => {
              onSettings({ ...settings, mode });
            }}
          >
            {t.modes[mode]}
          </button>
        );
      })}
    </div>
  );
}

interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, onChange }: SliderProps): ReactElement {
  const id = useId();
  return (
    <label htmlFor={id} style={fieldStyle}>
      <span>{`${label}: ${String(value)}`}</span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={inputStyle}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}

/** The terraform panel: brush modes, radius and strength sliders and the live earthworks readout. */
export function TerraformControls(props: TerraformControlsProps): ReactElement {
  const { strings, settings, readout, onSettings } = props;
  const t = strings.terraform;
  return (
    <section aria-label={t.heading} style={panelStyle}>
      <h3 style={headingStyle}>{t.heading}</h3>
      <ModeButtons {...props} />
      {settings.mode === 'level-item' && props.canLevelItem === 'no' ? (
        <p style={helpStyle}>{t.selectItemHint}</p>
      ) : null}
      <Slider
        label={t.radius}
        value={settings.radiusM}
        min={RADIUS_MIN_M}
        max={RADIUS_MAX_M}
        step={RADIUS_MIN_M}
        onChange={(radiusM) => {
          onSettings({ ...settings, radiusM });
        }}
      />
      <Slider
        label={t.strength}
        value={settings.strength}
        min={STRENGTH_MIN}
        max={STRENGTH_MAX}
        step={STRENGTH_STEP}
        onChange={(strength) => {
          onSettings({ ...settings, strength });
        }}
      />
      <p style={helpStyle}>{t.hatchKey}</p>
      <h4 style={subheadingStyle}>{t.readoutHeading}</h4>
      <div style={fieldStyle}>
        <p style={{ margin: 0 }}>{fill(t.cut, { value: readout.cut })}</p>
        <p style={{ margin: 0 }}>{fill(t.fill, { value: readout.fill })}</p>
        <p style={{ margin: 0 }}>{fill(t.net, { value: readout.net })}</p>
        <p style={{ margin: 0 }}>{fill(t.trucks, { value: readout.trucks })}</p>
        <p style={{ margin: 0 }}>{fill(t.disturbed, { value: readout.disturbed })}</p>
      </div>
    </section>
  );
}
