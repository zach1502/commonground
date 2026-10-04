import { ChartFigure } from './chart-figure.js';

export interface HistogramBin {
  readonly id: string;
  /** The range the bin covers, such as "0 to 50". */
  readonly label: string;
  readonly count: number;
}

export interface HistogramProps {
  readonly caption: string;
  /** What the bins measure, drawn under the columns. */
  readonly axisLabel: string;
  readonly bins: readonly HistogramBin[];
  readonly format: (count: number) => string;
}

const VIEW_WIDTH = 640;
const PLOT_HEIGHT = 160;
const COUNT_ROOM = 20;
const LABEL_ROOM = 44;
const GAP = 4;
const HALF = 0.5;
const LABEL_LINE = 18;

/** Columns side by side, one per bin, with the count above and the range below. */
export function Histogram({ caption, axisLabel, bins, format }: HistogramProps) {
  const tallest = Math.max(0, ...bins.map((bin) => bin.count));
  const columnWidth = bins.length === 0 ? 0 : VIEW_WIDTH / bins.length;
  const baseline = COUNT_ROOM + PLOT_HEIGHT;
  const heightOf = (count: number) => (tallest === 0 ? 0 : (count / tallest) * PLOT_HEIGHT);
  return (
    <ChartFigure
      caption={caption}
      readings={bins.map((bin) => ({ id: bin.id, text: `${bin.label}: ${format(bin.count)}` }))}
    >
      <svg
        className="ps-chart__drawing"
        viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(baseline + LABEL_ROOM)}`}
        aria-hidden="true"
        focusable="false"
      >
        {bins.map((bin, index) => {
          const x = index * columnWidth;
          const centre = x + columnWidth * HALF;
          const height = heightOf(bin.count);
          return (
            <g key={bin.id}>
              <rect
                className="ps-chart__bar"
                x={x + GAP}
                y={baseline - height}
                width={Math.max(0, columnWidth - GAP - GAP)}
                height={height}
              />
              <text
                className="ps-chart__value"
                data-kind="data"
                x={centre}
                y={baseline - height - GAP}
                textAnchor="middle"
              >
                {String(bin.count)}
              </text>
              <text
                className="ps-chart__label"
                x={centre}
                y={baseline + LABEL_LINE}
                textAnchor="middle"
              >
                {bin.label}
              </text>
            </g>
          );
        })}
        <line className="ps-chart__axis" x1={0} x2={VIEW_WIDTH} y1={baseline} y2={baseline} />
      </svg>
      <p className="ps-chart__axis-label">{axisLabel}</p>
    </ChartFigure>
  );
}
