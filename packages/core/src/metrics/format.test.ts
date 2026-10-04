import { describe, expect, it } from 'vitest';

import {
  formatCad,
  formatCubicMetres,
  formatGrade,
  formatMetres,
  formatPercent,
  formatPercentValue,
  plural,
  sentenceStart,
} from './format.js';

describe('number formats', () => {
  it('writes a fraction from 0 to 1 as a percent with at most one decimal', () => {
    expect(formatPercent(0.35)).toBe('35%');
    expect(formatPercent(0.351)).toBe('35.1%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.18249)).toBe('18.2%');
  });

  it('rounds half a tenth of a percent up, where toFixed rounded 0.35 down', () => {
    expect(formatPercent(0.0035)).toBe('0.4%');
  });

  it('writes a 0 to 100 percent value through the same format', () => {
    expect(formatPercentValue(0.35)).toBe('0.4%');
    expect(formatPercentValue(30)).toBe('30%');
    expect(formatPercentValue(1e-7)).toBe('0%');
  });

  it('writes a slope as a percent grade', () => {
    expect(formatGrade(0.07)).toBe('7%');
    expect(formatGrade(0.0526)).toBe('5.3%');
  });

  it('writes dollars rounded with thousands separators', () => {
    expect(formatCad(1234567.4)).toBe('$1,234,567');
    expect(formatCad(0)).toBe('$0');
  });

  it('writes volumes and lengths with units after the number', () => {
    expect(formatCubicMetres(10.46)).toBe('10.5 m³');
    expect(formatMetres(4.8)).toBe('4.8 m');
  });

  it('adds s to the noun unless the count is 1', () => {
    expect(plural(1, 'truck load')).toBe('1 truck load');
    expect(plural(0, 'bench item')).toBe('0 bench items');
  });

  it('capitalises the first letter of a sentence', () => {
    expect(sentenceStart('garden areas')).toBe('Garden areas');
  });
});
