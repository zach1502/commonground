import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MOTION_CLASS, MOTION_EASING, MOTION_MS, MOTION_OFFSET_PX } from './index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const css = (name: string) => readFileSync(path.join(HERE, name), 'utf8');
const MOTION_FILES = ['motion.css', 'pulse.css', 'press.css'];

describe('motion tokens', () => {
  it('names the two DESIGN.md durations and nothing else', () => {
    expect(MOTION_MS).toEqual({ small: 150, medium: 250 });
  });

  it('names the entry, exit and move curves', () => {
    expect(MOTION_EASING).toEqual({
      entry: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      exit: 'cubic-bezier(0.3, 0, 1, 1)',
      move: 'cubic-bezier(0.2, 0, 0, 1)',
    });
  });

  it('declares the same durations and curves in motion.css', () => {
    const text = css('motion.css');
    expect(text).toContain(`--motion-duration-small: ${String(MOTION_MS.small)}ms;`);
    expect(text).toContain(`--motion-duration-medium: ${String(MOTION_MS.medium)}ms;`);
    expect(text).toContain(`--motion-easing-entry: ${MOTION_EASING.entry};`);
    expect(text).toContain(`--motion-easing-exit: ${MOTION_EASING.exit};`);
    expect(text).toContain(`--motion-easing-move: ${MOTION_EASING.move};`);
  });

  it('moves panels 16 px at most', () => {
    expect(Math.max(...Object.values(MOTION_OFFSET_PX))).toBeLessThanOrEqual(16);
  });

  it('keeps every cubic-bezier y value between 0 and 1, so nothing overshoots', () => {
    const curves = [
      ...MOTION_FILES.map(css)
        .join('\n')
        .matchAll(/cubic-bezier\(([^)]+)\)/g),
    ];
    expect(curves.length).toBeGreaterThan(0);
    for (const [, args] of curves) {
      const [, y1, , y2] = (args ?? '').split(',').map(Number);
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y1).toBeLessThanOrEqual(1);
      expect(y2).toBeGreaterThanOrEqual(0);
      expect(y2).toBeLessThanOrEqual(1);
    }
  });

  it('uses linear and an endless loop only on the progress bar', () => {
    const text = MOTION_FILES.map(css).join('\n');
    const loops = text.split('\n').filter((line) => /infinite|linear/.test(line));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toContain('ps-progress');
  });

  it('turns every motion class off under reduced motion', () => {
    const text = MOTION_FILES.map(css).join('\n');
    const reduce = text.split('@media (prefers-reduced-motion: reduce)').slice(1).join('\n');
    for (const name of Object.values(MOTION_CLASS)) {
      expect(reduce, name).toContain(`.${name}`);
    }
  });
});
