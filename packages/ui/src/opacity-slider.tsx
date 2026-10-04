import { useId } from 'react';

import { PERCENT } from './percent.js';

export interface OpacitySliderProps {
  readonly label: string;
  /** 0 to 1. */
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly format: (value: number) => string;
}

/** A range input from 0 to 100 percent that reports opacity as 0 to 1. */
export function OpacitySlider({ label, value, onChange, format }: OpacitySliderProps) {
  const id = useId();
  return (
    <div className="ps-opacity-slider">
      <label htmlFor={id} className="ps-opacity-slider__label">
        {label}
      </label>
      <div className="ps-opacity-slider__row">
        <input
          id={id}
          type="range"
          min={0}
          max={PERCENT}
          step={1}
          value={Math.round(value * PERCENT)}
          onChange={(event) => {
            onChange(Number(event.target.value) / PERCENT);
          }}
        />
        <output htmlFor={id}>{format(value)}</output>
      </div>
    </div>
  );
}
