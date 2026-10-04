import { PERCENT_SCALE } from '../constants.js';

const ONE_DECIMAL = 1;
const LOCALE = 'en-CA';
// A percent is a fraction times 10 ** 2.
const PERCENT_DIGITS = 2;

const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: ONE_DECIMAL,
});

const cadFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

/** Rounds to one decimal and drops a trailing .0, so 30 stays 30 and 18.249 becomes 18.2. */
function oneDecimal(value: number): string {
  return String(Number(value.toFixed(ONE_DECIMAL)));
}

/**
 * A fraction from 0 to 1 as an en-CA percent with at most one decimal: 0.35 is "35%" and
 * 0.351 is "35.1%". A 0 to 100 Percent goes through formatPercentValue.
 */
export function formatPercent(fraction: number): string {
  return percentFormat.format(fraction);
}

/** A 0 to 100 Percent, such as a report total, through formatPercent. */
export function formatPercentValue(percent: number): string {
  // Shifting the decimal point in the text keeps 0.35 exact; 0.35 / 100 is 0.0034999... in binary.
  const shifted = Number(`${String(percent)}e-${String(PERCENT_DIGITS)}`);
  // String() writes values under 1e-6 in exponent form, which the shift cannot parse.
  return formatPercent(Number.isNaN(shifted) ? percent / PERCENT_SCALE : shifted);
}

/** Rise over run as a percent grade, so 0.07 is 7%. */
export function formatGrade(slope: number): string {
  return formatPercent(slope);
}

/** Whole Canadian dollars in en-CA style, such as "$1,234,567". */
export function formatCad(amount: number): string {
  return cadFormat.format(amount);
}

export function formatCubicMetres(volume: number): string {
  return `${oneDecimal(volume)} m³`;
}

export function formatMetres(length: number): string {
  return `${oneDecimal(length)} m`;
}

export function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 truck load" or "3 truck loads". */
export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
