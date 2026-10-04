import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { POSTGRES_OPTIONS } from './postgres.js';
import { DATABASE_QUERY_TIMEOUT_MS } from './start.js';

import { createDatabase } from './index.js';

const MS_PER_SECOND = 1000;
const LONG_OUTAGE_RETRIES = 50;
const deps = { clock: new FakeClock(new Date('2026-09-01T00:00:00Z')), newId: () => 'fixed-id' };
// Port 1 on loopback refuses at once, so the test proves the driver choice without a server.
const REFUSED_URL = 'postgres://parkshape:unused@127.0.0.1:1/parkshape';

describe('openPostgres', () => {
  it('turns off prepared statements for the Supabase transaction pooler', () => {
    expect(POSTGRES_OPTIONS.prepare).toBe(false);
  });

  it('reconnects within a second after a long outage instead of backing off for 20 s', () => {
    expect(POSTGRES_OPTIONS.backoff(0)).toBeGreaterThan(0);
    expect(POSTGRES_OPTIONS.backoff(LONG_OUTAGE_RETRIES)).toBeLessThanOrEqual(1);
  });

  it('gives up on a new connection well before the query timeout', () => {
    expect(POSTGRES_OPTIONS.connect_timeout * MS_PER_SECOND).toBeLessThan(
      DATABASE_QUERY_TIMEOUT_MS,
    );
  });

  it('routes postgres:// URLs to the postgres-js driver', async () => {
    await expect(createDatabase({ DATABASE_URL: REFUSED_URL }, deps)).rejects.toMatchObject({
      cause: { code: 'ECONNREFUSED' },
    });
  });
});
