import { useId, type ReactNode } from 'react';

export interface MeterGroupProps {
  readonly heading: string;
  readonly children: ReactNode;
}

/** A titled set of meters, so residents scan the design's targets by theme. */
export function MeterGroup({ heading, children }: MeterGroupProps) {
  const headingId = useId();
  return (
    <section className="ps-meter-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="ps-meter-group__heading">
        {heading}
      </h3>
      <div className="ps-meter-group__body">{children}</div>
    </section>
  );
}
