import { describe, expect, it } from 'vitest';

import {
  advanceHints,
  dismissHint,
  hintsStorageKey,
  HINTS_START,
  parseHints,
  serialiseHints,
} from './hints.js';

describe('hints', () => {
  it('shows both hints on a first visit', () => {
    expect(parseHints(null)).toEqual(HINTS_START);
    expect(parseHints('')).toEqual({ camera: 'pending', path: 'pending' });
  });

  it('remembers which hints were dismissed across a reload', () => {
    expect(parseHints('camera')).toEqual({ camera: 'dismissed', path: 'pending' });
    expect(parseHints('camera,path')).toEqual({ camera: 'dismissed', path: 'dismissed' });
  });

  it('round-trips through storage', () => {
    const states = [
      { camera: 'pending', path: 'pending' },
      { camera: 'dismissed', path: 'pending' },
      { camera: 'dismissed', path: 'dismissed' },
    ] as const;
    states.forEach((state) => {
      expect(parseHints(serialiseHints(state))).toEqual(state);
    });
  });

  it('dismisses the camera hint on the first drag or wheel', () => {
    expect(advanceHints(HINTS_START, 'camera-moved')).toEqual({
      camera: 'dismissed',
      path: 'pending',
    });
  });

  it('dismisses the path hint on the first point', () => {
    expect(advanceHints(HINTS_START, 'path-point-added')).toEqual({
      camera: 'pending',
      path: 'dismissed',
    });
  });

  it('dismisses a named hint by hand and leaves a dismissed one alone', () => {
    const once = dismissHint(HINTS_START, 'camera');
    expect(once).toEqual({ camera: 'dismissed', path: 'pending' });
    expect(dismissHint(once, 'camera')).toBe(once);
  });

  it('keys storage by user id', () => {
    expect(hintsStorageKey('user-7')).toBe('parkshape.hints.user-7');
  });
});
