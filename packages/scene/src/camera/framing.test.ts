import { describe, expect, it } from 'vitest';

import { framingOf, reframeFor } from './framing.js';

const PARCEL = { minX: 0, maxX: 176, minZ: 0, maxZ: 86, minY: 20, maxY: 31 };
const ASPECT = 1.2;
const shown = framingOf({ bounds: PARCEL, aspect: ASPECT, request: 0 });

describe('reframeFor (owner bug 1)', () => {
  it('places the camera on the first frame', () => {
    expect(reframeFor({ shown: null, next: shown, camera: 'framed' })).toBe('place');
  });

  it('holds the camera when an edit rebuilds the scene with equal bounds', () => {
    const rebuilt = framingOf({ bounds: { ...PARCEL }, aspect: ASPECT, request: 0 });
    expect(reframeFor({ shown, next: rebuilt, camera: 'moved' })).toBe('hold');
  });

  it('holds the camera when terraform changes only the ground heights', () => {
    const graded = framingOf({ bounds: { ...PARCEL, maxY: 33.5 }, aspect: ASPECT, request: 0 });
    expect(reframeFor({ shown, next: graded, camera: 'moved' })).toBe('hold');
  });

  it('flies to a preset each time one is clicked', () => {
    const clicked = framingOf({ bounds: PARCEL, aspect: ASPECT, request: 1 });
    expect(reframeFor({ shown, next: clicked, camera: 'moved' })).toBe('fly');
  });

  it('places the camera again for a new parcel', () => {
    const other = framingOf({ bounds: { ...PARCEL, maxX: 90 }, aspect: ASPECT, request: 0 });
    expect(reframeFor({ shown, next: other, camera: 'moved' })).toBe('place');
  });

  it('refits on a resize until the person moves the camera, then holds', () => {
    const resized = framingOf({ bounds: PARCEL, aspect: 1.6, request: 0 });
    expect(reframeFor({ shown, next: resized, camera: 'framed' })).toBe('place');
    expect(reframeFor({ shown, next: resized, camera: 'moved' })).toBe('hold');
  });
});
