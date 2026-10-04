import { describe, expect, it, vi } from 'vitest';

const preload = vi.hoisted(() => vi.fn());

vi.mock('@react-three/drei', () => ({
  useTexture: Object.assign(vi.fn(), { preload }),
}));

vi.mock('@react-three/fiber', () => ({ useThree: vi.fn() }));

const { preloadSurfaceMaps } = await import('./surface-textures.js');

describe('preloadSurfaceMaps', () => {
  it('starts every map at once, so a second map does not wait for the first', () => {
    preloadSurfaceMaps(['grass-detail', 'grass-normal']);
    expect(preload.mock.calls).toEqual([
      ['/textures/grass-detail.jpg'],
      ['/textures/grass-normal.jpg'],
    ]);
  });
});
