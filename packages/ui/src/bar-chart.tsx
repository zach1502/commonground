import { ChartFigure } from './chart-figure.js';

export interface Bar {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** The value as words, when it says more than the number, such as "40%, 1.3 each". */
  readonly valueText?: string;
}

export interface BarChartProps {
  readonly caption: string;
  readonly bars: readonly Bar[];
  /** The value a full-length bar stands for; defaults to the largest value. */
  readonly max?: number;
  readonly format: (value: number) => string;
}

const VIEW_WIDTH = 640;
const ROW_HEIGHT = 32;
const BAR_HEIGHT = 18;
const LABEL_WIDTH = 140;
const VALUE_WIDTH = 120;
const GAP = 8;
const TRACK_WIDTH = VIEW_WIDTH - LABEL_WIDTH - VALUE_WIDTH - GAP - GAP;
const HALF = 0.5;

/** Horizontal bars with the label on the text edge at the left and the value on the right. */
export function BarChart({ caption, bars, max, format }: BarChartProps) {
  const textOf = (bar: Bar) => bar.valueText ?? format(bar.value);
  const top = max ?? Math.max(0, ...bars.map((bar) => bar.value));
  const lengthOf = (value: number) => (top <= 0 ? 0 : (Math.min(value, top) / top) * TRACK_WIDTH);
  const height = bars.length * ROW_HEIGHT;
  const trackX = LABEL_WIDTH + GAP;
  return (
    <ChartFigure
      caption={caption}
      readings={bars.map((bar) => ({ id: bar.id, text: `${bar.label}: ${textOf(bar)}` }))}
    >
      <svg
        className="ps-chart__drawing"
        viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(height)}`}
        aria-hidden="true"
        focusable="false"
      >
        {bars.map((bar, index) => {
          const y = index * ROW_HEIGHT;
          const middle = y + ROW_HEIGHT * HALF;
          const barY = middle - BAR_HEIGHT * HALF;
          return (
            <g key={bar.id}>
              <text className="ps-chart__label" x={0} y={middle} textAnchor="start">
                {bar.label}
              </text>
              <rect
                className="ps-chart__track"
                x={trackX}
                y={barY}
                width={TRACK_WIDTH}
                height={BAR_HEIGHT}
              />
              <rect
                className="ps-chart__bar"
                x={trackX}
                y={barY}
                width={lengthOf(bar.value)}
                height={BAR_HEIGHT}
              />
              <text
                className="ps-chart__value"
                data-kind="data"
                x={trackX + TRACK_WIDTH + GAP}
                y={middle}
              >
                {textOf(bar)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFigure>
  );
}
