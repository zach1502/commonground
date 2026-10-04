import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';

import {
  createSiteContextProvider,
  createSiteFeaturesProvider,
  createTerrainProvider,
} from './select-providers.js';

const fetch = () => Promise.reject(new Error('no network in tests'));

describe('createTerrainProvider', () => {
  it('serves the recorded fixture by default', () => {
    expect(createTerrainProvider(loadConfig({}), { fetch }).name).toBe('static');
  });

  it('builds the HRDEM adapter', () => {
    expect(createTerrainProvider({ TERRAIN_PROVIDER: 'hrdem' }, { fetch }).name).toBe('hrdem');
  });

  it('chains HRDEM, then MRDEM, then the fixture', () => {
    expect(createTerrainProvider({ TERRAIN_PROVIDER: 'chain' }, { fetch }).name).toBe(
      'chain(hrdem,mrdem,static)',
    );
  });

  it('builds the MRDEM adapter for tools that ask for it', () => {
    expect(createTerrainProvider({ TERRAIN_PROVIDER: 'mrdem' }, { fetch }).name).toBe('mrdem');
  });
});

describe('createSiteFeaturesProvider', () => {
  it('serves the recorded fixture by default', () => {
    expect(createSiteFeaturesProvider(loadConfig({}), { fetch }).name).toBe('static');
  });

  it('builds the Vancouver Open Data adapter', () => {
    expect(
      createSiteFeaturesProvider({ SITE_FEATURES_PROVIDER: 'vancouver' }, { fetch }).name,
    ).toBe('vancouver');
  });
});

describe('createSiteContextProvider', () => {
  const clock = new FakeClock(new Date('2026-10-03T16:30:00.000Z'));

  it('serves the recorded fixture by default', () => {
    expect(createSiteContextProvider(loadConfig({}), { fetch, clock }).name).toBe('static');
  });

  it('builds the Vancouver Open Data and TransLink adapter', () => {
    expect(
      createSiteContextProvider({ SITE_CONTEXT_PROVIDER: 'vancouver' }, { fetch, clock }).name,
    ).toBe('vancouver');
  });
});
