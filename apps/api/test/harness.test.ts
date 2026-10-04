import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfigFromProcess } from '@parkshape/config';

import { InlineMetricsRunner } from '../src/adapters/inline-metrics-runner.js';

import { startHarness, type Harness } from './harness.js';

const SERVER_URL = loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL;

let harness: Harness;

// The harness starts in the hook: starting pglite under a full parallel run takes longer than
// the 5 s test timeout, and the hooks get the pglite budget from vitest.config.ts.
beforeAll(async () => {
  harness = await startHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('startHarness', () => {
  it.skipIf(SERVER_URL !== '')('runs the API on in-memory pglite by default', () => {
    expect(harness.databaseUrl).toBe('pglite://memory');
  });

  it.skipIf(SERVER_URL === '')(
    'runs the API on its own scratch database when PARKSHAPE_TEST_DATABASE_URL is set',
    async () => {
      expect(harness.databaseUrl).toMatch(/\/parkshape_test_[0-9a-f]{32}$/);
      expect((await harness.call('GET', '/health')).status).toBe(200);
    },
  );

  it('measures submits on the calling thread unless a test asks for the worker pool', () => {
    expect(harness.deps.metrics).toBeInstanceOf(InlineMetricsRunner);
  });
});
