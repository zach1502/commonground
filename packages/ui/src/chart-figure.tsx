import { useId } from 'react';
import type { ReactNode } from 'react';

export interface ChartReading {
  readonly id: string;
  readonly text: string;
}

export interface ChartFigureProps {
  /** One plain sentence that says what the chart shows. */
  readonly caption: string;
  /** The same numbers as text, read out in place of the drawing. */
  readonly readings: readonly ChartReading[];
  readonly children: ReactNode;
}

/** A figure with its caption, the drawing hidden from screen readers and the numbers as a list. */
export function ChartFigure({ caption, readings, children }: ChartFigureProps) {
  const captionId = useId();
  return (
    <figure className="ps-chart" aria-labelledby={captionId}>
      {children}
      <ul className="ps-visually-hidden">
        {readings.map((reading) => (
          <li key={reading.id}>{reading.text}</li>
        ))}
      </ul>
      <figcaption id={captionId} className="ps-chart__caption">
        {caption}
      </figcaption>
    </figure>
  );
}
