/**
 * The key for the insights heatmap. HeatmapOverlay draws one hue, the domain palette's water
 * blue, from a tint for cells few designs touched to the full colour for the busiest cell. The
 * key repeats that ramp in a few flat steps and names the design count at its ends.
 */

const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;
const CHANNEL_MAX = 255;
// The same share toward white as the overlay's ramp in packages/scene heat-ramp.ts.
const TINT_SHARE = 0.45;
const LEGEND_STEPS = 5;

type Rgb = readonly [number, number, number];

function channelsOf(hex: string): Rgb {
  const match = HEX_COLOUR.exec(hex.trim());
  if (match === null) throw new RangeError(`Expected a #rrggbb colour, got ${hex}`);
  const [red, green, blue] = [match[1], match[2], match[3]].map((part) =>
    parseInt(part ?? '0', HEX_RADIX),
  );
  return [red ?? 0, green ?? 0, blue ?? 0];
}

const hexOf = (channels: readonly number[]): string =>
  `#${channels.map((value) => Math.round(value).toString(HEX_RADIX).padStart(HEX_DIGITS, '0')).join('')}`;

/** Flat colours from the ramp's tint to its full colour, lightest first. */
export function legendSteps(hex: string): string[] {
  const high = channelsOf(hex);
  const low = high.map((channel) => channel + (CHANNEL_MAX - channel) * TINT_SHARE);
  return Array.from({ length: LEGEND_STEPS }, (_, step) => {
    const t = step / (LEGEND_STEPS - 1);
    return hexOf(high.map((channel, index) => (low[index] ?? channel) * (1 - t) + channel * t));
  });
}

/** Designs behind the busiest cell; the API sends each cell as a share of all designs. */
export function legendMax(values: readonly number[], designs: number): number {
  const peak = values.reduce((highest, value) => Math.max(highest, value), 0);
  return Math.round(peak * designs);
}
