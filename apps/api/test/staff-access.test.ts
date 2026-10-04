import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../src/contracts/common.js';
import { meSchema, personaListSchema } from '../src/contracts/participation.js';

import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const HOSTED_ORIGIN = 'https://example.test';
const ACCESS_CODE = 'harbour-otter-42';

let local: Harness;
let hosted: Harness;

beforeAll(async () => {
  local = await startHarness();
  hosted = await startHarness({ CORS_ORIGIN: HOSTED_ORIGIN, STAFF_ACCESS_CODE: ACCESS_CODE });
});

afterAll(async () => {
  await Promise.all([local.close(), hosted.close()]);
});

const loginOn = (h: Harness, body: Record<string, string>) =>
  h.call('POST', '/auth/login', { body });

describe('staff login on a local origin', () => {
  it('says no code is needed and signs staff in without one', async () => {
    const personas = personaListSchema.parse((await local.call('GET', '/auth/personas')).body);
    expect(personas.staffCodeRequired).toBe(false);
    const response = await loginOn(local, { persona: STAFF });
    expect(response.status).toBe(200);
    expect(meSchema.parse(response.body).user.role).toBe('staff');
  });
});

describe('staff login on a hosted origin', () => {
  it('tells the web app that staff need the access code', async () => {
    const personas = personaListSchema.parse((await hosted.call('GET', '/auth/personas')).body);
    expect(personas.staffCodeRequired).toBe(true);
  });

  it('refuses staff with no access code', async () => {
    const response = await loginOn(hosted, { persona: STAFF });
    expect(response.status).toBe(403);
    expect(errorKind(response.body)).toBe('access-code-refused');
    expect(errorBodySchema.parse(response.body).error.message).toBe(
      'The access code is missing or wrong. Ask the project lead for the code.',
    );
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses staff with a wrong access code, including one of a different length', async () => {
    for (const accessCode of ['harbour-otter-41', 'x']) {
      const response = await loginOn(hosted, { persona: STAFF, accessCode });
      expect(response.status).toBe(403);
      expect(errorKind(response.body)).toBe('access-code-refused');
    }
  });

  it('signs staff in with the right access code and sets a Secure cookie', async () => {
    const response = await loginOn(hosted, { persona: STAFF, accessCode: ACCESS_CODE });
    expect(response.status).toBe(200);
    expect(meSchema.parse(response.body).user.role).toBe('staff');
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/; Secure(;|$)/);
  });

  it('signs residents in with no access code', async () => {
    const response = await loginOn(hosted, { persona: BOB });
    expect(response.status).toBe(200);
    expect(meSchema.parse(response.body).user.role).toBe('resident');
  });
});
