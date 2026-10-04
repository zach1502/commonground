import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startWorld, type World } from './world.js';

const WEB_ORIGIN = 'https://parkshape.example.ca';
const FOREIGN_ORIGIN = 'https://evil.example.com';
// A hosted origin needs the staff access code before the API starts.
const ACCESS_CODE = 'cors-test-access-code';

let world: World;

beforeAll(async () => {
  world = await startWorld({ CORS_ORIGIN: WEB_ORIGIN, STAFF_ACCESS_CODE: ACCESS_CODE });
});

afterAll(async () => {
  await world.h.close();
});

const preflight = (origin: string) =>
  world.h.app.request('/votes', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });

const actual = (origin: string) =>
  world.h.app.request('/projects', { headers: { Origin: origin } });

describe('CORS for a foreign origin', () => {
  it('gives a preflight no allowed origin and no credentials', async () => {
    const response = await preflight(FOREIGN_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('gives an actual request no allowed origin and no credentials', async () => {
    const response = await actual(FOREIGN_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('treats a lookalike of the web origin as foreign', async () => {
    const response = await actual(`${WEB_ORIGIN}.evil.example.com`);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('CORS for the configured web origin', () => {
  it('allows the preflight with credentials', async () => {
    const response = await preflight(WEB_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('allows the actual request with credentials and varies on Origin', async () => {
    const response = await actual(WEB_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Vary')).toContain('Origin');
  });
});
