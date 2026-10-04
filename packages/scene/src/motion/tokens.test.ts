import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CAMERA_MOVE_MS, CURVES, cssCurve, SMALL_MS, VIEW_CHANGE_MS } from './tokens.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOTION_CSS = readFileSync(path.join(HERE, '../../../ui/src/motion/motion.css'), 'utf8');

/** The value of a custom property in motion.css, or undefined when it is not declared. */
function cssToken(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(MOTION_CSS)?.[1]?.trim();
}

describe('scene motion tokens', () => {
  it('match the small and medium durations in the ui motion module', () => {
    expect(cssToken('motion-duration-small')).toBe(`${String(SMALL_MS)}ms`);
    expect(cssToken('motion-duration-medium')).toBe(`${String(VIEW_CHANGE_MS)}ms`);
  });

  it('match the entry and exit curves in the ui motion module', () => {
    expect(cssToken('motion-easing-entry')).toBe(cssCurve('entry'));
    expect(cssToken('motion-easing-exit')).toBe(cssCurve('exit'));
  });

  it('match the move curve in the ui motion module', () => {
    expect(cssToken('motion-easing-move')).toBe(cssCurve('move'));
    expect(cssCurve('move')).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('run a camera move for 400 ms', () => {
    expect(CAMERA_MOVE_MS).toBe(400);
  });

  it('keep every curve inside 0 to 1 on y, so nothing overshoots', () => {
    Object.values(CURVES).forEach((curve) => {
      [curve.y1, curve.y2].forEach((y) => {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      });
    });
  });
});
