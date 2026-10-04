import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BOB, STAFF, startHarness, type Harness } from '../harness.js';

import { startWorld, type World } from './world.js';

const LIMIT = 2;
const SPOOFED = ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4'];

/** Sends a sign-in with the given headers and, when given, a connection address. */
async function signIn(h: Harness, headers: Record<string, string>, remoteAddress?: string) {
  const env = remoteAddress === undefined ? undefined : { incoming: { socket: { remoteAddress } } };
  const response = await h.app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ persona: BOB }),
    },
    env,
  );
  return response.status;
}

const spoofed = (index: number) => ({
  'X-Forwarded-For': SPOOFED[index] ?? '',
  'X-Real-IP': SPOOFED[index] ?? '',
});

describe('a limiter keyed by user', () => {
  let world: World;

  beforeAll(async () => {
    world = await startWorld({ RATE_LIMIT_VOTES_PER_MINUTE: String(LIMIT) });
  });

  afterAll(async () => {
    await world.h.close();
  });

  it('keeps one bucket per person whatever address headers they send', async () => {
    const statuses = [];
    for (let index = 0; index <= LIMIT; index += 1) {
      const response = await world.call('POST', '/votes', {
        cookie: world.cookies.residentB ?? '',
        headers: spoofed(index),
        body: { designId: world.liveId, value: 1, reasons: [] },
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('the sign-in limiter without TRUST_PROXY', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ RATE_LIMIT_LOGINS_PER_MINUTE: String(LIMIT) });
  });

  afterAll(async () => {
    await h.close();
  });

  it('ignores X-Forwarded-For and X-Real-IP, so spoofing makes no new bucket', async () => {
    const statuses = [];
    for (let index = 0; index <= LIMIT; index += 1) {
      statuses.push(await signIn(h, spoofed(index)));
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('keys by the connection address', async () => {
    for (let count = 0; count < LIMIT; count += 1) {
      expect(await signIn(h, spoofed(count), '192.0.2.50')).toBe(200);
    }
    expect(await signIn(h, spoofed(LIMIT), '192.0.2.50')).toBe(429);
    expect(await signIn(h, {}, '192.0.2.51')).toBe(200);
  });
});

describe('the sign-in limiter with TRUST_PROXY', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ RATE_LIMIT_LOGINS_PER_MINUTE: String(LIMIT), TRUST_PROXY: 'true' });
  });

  afterAll(async () => {
    await h.close();
  });

  it('keys by the first hop the proxies did not add, not by what the caller wrote', async () => {
    const statuses = [];
    for (let index = 0; index <= LIMIT; index += 1) {
      const chain = `${SPOOFED[index] ?? ''}, 198.51.100.20, 10.0.0.1`;
      statuses.push(await signIn(h, { 'X-Forwarded-For': chain }, '10.0.0.2'));
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(await signIn(h, { 'X-Forwarded-For': '198.51.100.21' }, '10.0.0.2')).toBe(200);
  });

  it('ignores X-Real-IP', async () => {
    const statuses = [];
    for (let index = 0; index <= LIMIT; index += 1) {
      statuses.push(await signIn(h, { 'X-Real-IP': SPOOFED[index] ?? '' }, '10.0.0.3'));
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('still limits staff sign-ins through the same buckets', async () => {
    const response = await h.call('POST', '/auth/login', {
      body: { persona: STAFF },
      headers: { 'X-Forwarded-For': '198.51.100.20' },
    });
    expect(response.status).toBe(429);
  });
});
