export interface ProgressCountProps {
  /** The localized visible label, for example "3 of 5". */
  readonly label: string;
  readonly current: number;
  readonly total: number;
}

/** Shows how far the voter is through the batch, announced politely to screen readers. */
export function ProgressCount({ label, current, total }: ProgressCountProps) {
  return (
    <p
      className="ps-progress-count"
      role="status"
      aria-live="polite"
      data-kind="data"
      data-current={current}
      data-total={total}
    >
      {label}
    </p>
  );
}
