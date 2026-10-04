import { describe, expect, it } from 'vitest';

import { datasetName } from './dataset-name';

const names = { 'public-trees': 'public trees' };

describe('datasetName', () => {
  it('uses the plain name the locale gives a dataset', () => {
    expect(datasetName('public-trees', names)).toBe('public trees');
  });

  it('turns an unknown dataset id into words instead of showing the slug', () => {
    expect(datasetName('street-lighting-poles', names)).toBe('street lighting poles');
  });
});
