import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';

import { classNames } from './class-names.js';

export interface SegmentOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface SegmentedControlProps<Value extends string> {
  readonly label: string;
  readonly options: readonly SegmentOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}

const STEP_BY_KEY: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * A row of joined buttons that picks one option, with arrow keys as in a radio group. The value
 * may belong to a sibling group; then the first option takes Tab, as in a radio group with no
 * choice made.
 */
export function SegmentedControl<Value extends string>(props: SegmentedControlProps<Value>) {
  const { label, options, value, onChange } = props;
  const groupId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = Math.max(checkedIndex, 0);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEP_BY_KEY[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (focusIndex + step + options.length) % options.length;
    const target = options[next];
    if (target === undefined) return;
    onChange(target.value);
    buttons.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="ps-segmented">
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-labelledby={`${groupId}-${option.value}`}
            aria-checked={checked ? 'true' : 'false'}
            tabIndex={index === focusIndex ? 0 : -1}
            className={classNames(
              'ps-segmented__option',
              checked ? 'ps-segmented__option--on' : '',
            )}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={onKeyDown}
          >
            <span id={`${groupId}-${option.value}`}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
