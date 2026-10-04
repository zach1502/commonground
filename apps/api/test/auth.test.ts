import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../src/contracts/common.js';
import { meSchema, personaListSchema } from '../src/contracts/participation.js';

import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h.close();
});

describe('auth routes', () => {
  it('lists the personas', async () => {
    const response = await h.call('GET', '/auth/personas');
    expect(response.status).toBe(200);
    const { personas } = personaListSchema.parse(response.body);
    expect(personas.map((persona) => persona.id)).toContain(STAFF);
  });

  it('signs in with a persona, sets an HttpOnly cookie and returns the user', async () => {
    const response = await h.call('POST', '/auth/login', { body: { persona: BOB } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly/);
    expect(meSchema.parse(response.body).user).toEqual({
      id: BOB,
      role: 'resident',
      displayName: 'Bob Walksadog',
    });
  });

  it('refuses an unknown persona and a malformed body', async () => {
    const unknown = await h.call('POST', '/auth/login', { body: { persona: 'nobody' } });
    expect(unknown.status).toBe(404);
    const malformed = await h.call('POST', '/auth/login', { body: { name: 1 } });
    expect(malformed.status).toBe(400);
    expect(errorBodySchema.parse(malformed.body).error.issues?.[0]?.path).toBe('persona');
  });

  it('returns 401 from /me without a session and the user with one', async () => {
    const anonymous = await h.call('GET', '/me');
    expect(anonymous.status).toBe(401);
    expect(errorKind(anonymous.body)).toBe('unauthenticated');
    const cookie = await h.login(STAFF);
    const me = await h.call('GET', '/me', { cookie });
    expect(meSchema.parse(me.body).user.role).toBe('staff');
  });

  it('leaves Secure off the cookie for a localhost origin and sets a 7 day Max-Age', async () => {
    const response = await h.call('POST', '/auth/login', { body: { persona: BOB } });
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).not.toMatch(/Secure/);
    expect(setCookie).toMatch(/Max-Age=604800/);
  });

  it('returns 401 once the session has expired', async () => {
    const cookie = await h.login(BOB);
    expect((await h.call('GET', '/me', { cookie })).status).toBe(200);
    h.clock.advance(SEVEN_DAYS_MS);
    const expired = await h.call('GET', '/me', { cookie });
    expect(expired.status).toBe(401);
    expect(errorKind(expired.body)).toBe('unauthenticated');
  });

  it('signs out, clears the cookie and refuses the old cookie', async () => {
    const cookie = await h.login(BOB);
    const response = await h.call('POST', '/auth/logout', { cookie });
    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
    expect((await h.call('GET', '/me', { cookie })).status).toBe(401);
  });
});

describe('cross-cutting behaviour', () => {
  it('echoes a safe request id and makes one otherwise', async () => {
    const echoed = await h.call('GET', '/health', { headers: { 'X-Request-Id': 'abc-123' } });
    expect(echoed.headers.get('X-Request-Id')).toBe('abc-123');
    const made = await h.call('GET', '/health', { headers: { 'X-Request-Id': 'bad id!' } });
    expect(made.headers.get('X-Request-Id')).toMatch(/^id-\d+$/);
  });

  it('puts the request id in error bodies', async () => {
    const response = await h.call('GET', '/me', { headers: { 'X-Request-Id': 'trace-1' } });
    expect(errorBodySchema.parse(response.body).error.requestId).toBe('trace-1');
  });

  it('answers CORS preflight for the configured origin with credentials', async () => {
    const response = await h.call('OPTIONS', '/votes', {
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const response = await h.call('GET', '/missing');
    expect(response.status).toBe(404);
    expect(errorKind(response.body)).toBe('not-found');
  });
});
