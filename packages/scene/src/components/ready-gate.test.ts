import { describe, expect, it } from 'vitest';

import { createReadyGate, READY_AFTER_FRAMES } from './ready-gate.js';

describe('createReadyGate', () => {
  it('stays waiting until the scene has drawn the settle frames', () => {
    const gate = createReadyGate(READY_AFTER_FRAMES);
    const seen = Array.from({ length: READY_AFTER_FRAMES }, () => gate.drawn());
    expect(seen.slice(0, -1).every((state) => state === 'waiting')).toBe(true);
    expect(seen.at(-1)).toBe('ready');
  });

  it('reports ready once, then stays done', () => {
    const gate = createReadyGate(1);
    expect(gate.drawn()).toBe('ready');
    expect(gate.drawn()).toBe('done');
    expect(gate.drawn()).toBe('done');
  });

  it('waits for at least two frames, so textures uploaded on the first are on screen', () => {
    expect(READY_AFTER_FRAMES).toBeGreaterThanOrEqual(2);
  });
});
