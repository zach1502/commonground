import { describe, expect, it } from 'vitest';

import {
  normaliseDegrees,
  randomRotation,
  rotateByStep,
  rotationFromDrag,
  ROTATION_STEP_DEG,
  snapRotation,
} from './rotation.js';

describe('rotateByStep', () => {
  it('turns by 15 degrees each way', () => {
    expect(ROTATION_STEP_DEG).toBe(15);
    expect(rotateByStep(0, 'increase')).toBe(15);
    expect(rotateByStep(30, 'decrease')).toBe(15);
  });

  it('wraps around a full turn', () => {
    expect(rotateByStep(0, 'decrease')).toBe(345);
    expect(rotateByStep(345, 'increase')).toBe(0);
  });

  it('lands on a step when it starts between steps', () => {
    expect(rotateByStep(20, 'increase')).toBe(30);
    expect(rotateByStep(20, 'decrease')).toBe(15);
  });
});

describe('normaliseDegrees', () => {
  it('keeps angles in [0, 360)', () => {
    expect(normaliseDegrees(360)).toBe(0);
    expect(normaliseDegrees(-90)).toBe(270);
    expect(normaliseDegrees(725)).toBe(5);
  });
});

describe('snapRotation', () => {
  it('rounds to the nearest 15 degrees', () => {
    expect(snapRotation(22)).toBe(15);
    expect(snapRotation(23)).toBe(30);
    expect(snapRotation(359)).toBe(0);
  });
});

describe('rotationFromDrag', () => {
  it('turns one step for each 20 px of drag', () => {
    expect(rotationFromDrag(0, 45)).toBe(30);
    expect(rotationFromDrag(0, -25)).toBe(345);
    expect(rotationFromDrag(90, 5)).toBe(90);
  });
});

describe('randomRotation', () => {
  it('maps the random draw onto a full turn', () => {
    expect(randomRotation({ next: () => 0.5 })).toBe(180);
    expect(randomRotation({ next: () => 0 })).toBe(0);
    expect(randomRotation({ next: () => 0.99999 })).toBe(0);
    expect(randomRotation({ next: () => 0.1234 })).toBe(44);
  });
});
