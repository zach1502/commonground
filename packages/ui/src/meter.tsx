import { useEffect, useId, useState } from 'react';

import { classNames } from './class-names.js';
import { MOTION_CLASS } from './motion/index.js';

export type MeterStatus = 'ok' | 'warn' | 'fail';

const FULL_PERCENT = 100;

export interface MeterProps {
  readonly label: string;
  readonly value: number;
  readonly limit: number;
  readonly status: MeterStatus;
  readonly valueText: string;
  readonly statusText: string;
}

/** The share of the limit that the value fills, from 0 to 100. */
export function meterPercent(value: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }
  return Math.min(FULL_PERCENT, Math.max(0, (value / limit) * FULL_PERCENT));
}

/** Holds a value until it stops changing for `delayMs`, so a live region announces once. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}

/** A labelled bar that shows a value against its limit, coloured by status. */
export function Meter({ label, value, limit, status, valueText, statusText }: MeterProps) {
  const labelId = useId();
  return (
    <div
      role="meter"
      aria-labelledby={labelId}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuetext={valueText}
      className={classNames('ps-meter', `ps-meter--${status}`)}
    >
      <div className="ps-meter__header">
        <span id={labelId} className="ps-meter__label">
          {label}
        </span>
        <span className="ps-meter__value" data-kind="data">
          {valueText}
        </span>
      </div>
      <div className="ps-meter__track">
        <div
          className={classNames('ps-meter__fill', MOTION_CLASS.status)}
          style={{ width: `${String(meterPercent(value, limit))}%` }}
        />
      </div>
      <span className="ps-meter__status ps-visually-hidden">{statusText}</span>
    </div>
  );
}
