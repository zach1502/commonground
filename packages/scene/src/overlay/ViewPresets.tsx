import type { ReactElement } from 'react';

import type { PresetName } from '../camera/presets.js';

import { buttonGroupStyle, buttonStyle } from './styles.js';

export interface ViewPresetLabels {
  readonly viewControls: string;
  readonly resetView: string;
  readonly topDown: string;
  readonly birdsEye: string;
}

export interface ViewPresetsProps {
  readonly labels: ViewPresetLabels;
  readonly onSelect: (preset: PresetName) => void;
}

/** Reset view, Top-down and Bird's eye buttons. */
export function ViewPresets({ labels, onSelect }: ViewPresetsProps): ReactElement {
  const options: readonly [PresetName, string][] = [
    ['reset', labels.resetView],
    ['top-down', labels.topDown],
    ['birds-eye', labels.birdsEye],
  ];
  return (
    <div role="group" aria-label={labels.viewControls} style={buttonGroupStyle}>
      {options.map(([preset, label]) => (
        <button
          key={preset}
          type="button"
          style={buttonStyle}
          onClick={() => {
            onSelect(preset);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
