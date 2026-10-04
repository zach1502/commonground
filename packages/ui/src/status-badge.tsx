import { Badge, type BadgeTone } from './badge.js';
import { classNames } from './class-names.js';
import type { MeterStatus } from './meter.js';

const TONE: Readonly<Record<MeterStatus, BadgeTone>> = {
  ok: 'success',
  warn: 'warning',
  fail: 'danger',
};

export interface StatusBadgeProps {
  readonly status: MeterStatus;
  /** The status word, such as "Over budget"; comes from the caller so no copy is hard-coded. */
  readonly statusText: string;
  /** Shown after the status when the constraint is hard, such as "Blocks submission". */
  readonly severityText?: string;
}

/** A coloured status word with an optional severity note for constraints that block a submit. */
export function StatusBadge({ status, statusText, severityText }: StatusBadgeProps) {
  return (
    <span className={classNames('ps-status-badge', `ps-status-badge--${status}`)}>
      <span data-kind="data">
        <Badge tone={TONE[status]}>{statusText}</Badge>
      </span>
      {severityText === undefined ? null : (
        <span className="ps-status-badge__severity">{severityText}</span>
      )}
    </span>
  );
}
