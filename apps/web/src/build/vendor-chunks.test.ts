import { describe, expect, it } from 'vitest';

import { vendorChunk } from './vendor-chunks';

const MODULES = '/repo/node_modules/.pnpm/pkg/node_modules';

describe('vendorChunk', () => {
  it.each([
    [`${MODULES}/three/build/three.module.js`, 'three'],
    [`${MODULES}/@react-three/fiber/dist/index.js`, 'r3f'],
    [`${MODULES}/@react-three/drei/core/Line.js`, 'r3f'],
    [`${MODULES}/react-dom/index.js`, 'react'],
  ])('puts %s in the %s chunk', (id, chunk) => {
    expect(vendorChunk(id)).toBe(chunk);
  });

  it.each([
    `${MODULES}/postprocessing/build/index.js`,
    `${MODULES}/@react-three/postprocessing/dist/index.js`,
    `${MODULES}/n8ao/dist/N8AO.js`,
  ])('keeps the composer code out of the r3f chunk, so tiers without it skip it: %s', (id) => {
    expect(vendorChunk(id)).toBe('postfx');
  });

  it('leaves app modules to Rollup', () => {
    expect(vendorChunk('/repo/apps/web/src/main.tsx')).toBeUndefined();
  });
});
