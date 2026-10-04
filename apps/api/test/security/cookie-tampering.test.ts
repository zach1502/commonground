import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MockAuthProvider } from '@parkshape/auth';

import { errorBodySchema } from '../../src/contracts/common.js';

import { startWorld, type World } from './world.js';

const COOKIE_NAME = 'parkshape_session';
const ABSURD_LENGTH = 100_000;
const MS_PER_SECOND = 1000;
const HOUR_S = 3600;

let world: World;
let auth: MockAuthProvider;

beforeAll(async () => {
  world = await startWorld();
  const provider = world.h.deps.auth;
  if (!(provider instanceof MockAuthProvider))
    throw new Error('the harness uses the mock provider');
  auth = provider;
});

afterAll(async () => {
  await world.h.close();
});

const encode = (claims: unknown) => Buffer.from(JSON.stringify(claims)).toString('base64url');
const nowS = () => Math.floor(world.h.clock.now().getTime() / MS_PER_SECOND);
const tokenOf = (cookie: string) => cookie.slice(COOKIE_NAME.length + 1);
const splitToken = (token: string) => {
  const [payload = '', signature = ''] = token.split('.');
  return { payload, signature };
};

function tamperedTokens(): Record<string, string> {
  const valid = tokenOf(world.cookies.residentB ?? '');
  const { payload, signature } = splitToken(valid);
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  return {
    'a bad signature': `${payload}.${flipped}`,
    'an altered payload with the old signature': `${encode({ ...claims, role: 'staff' })}.${signature}`,
    "another user's id with the old signature": `${encode({ ...claims, userId: world.userIds.residentA })}.${signature}`,
    'a well-signed expired session': auth.sign(encode({ ...claims, exp: nowS() - HOUR_S })),
    'a well-signed session for a user who does not exist': auth.sign(
      encode({ userId: 'no-such-user', role: 'resident', exp: nowS() + HOUR_S }),
    ),
    'a well-signed unknown role': auth.sign(encode({ ...claims, role: 'admin' })),
    'a well-signed payload that is not JSON': auth.sign(
      Buffer.from('not json').toString('base64url'),
    ),
    'an absurdly long value': 'a'.repeat(ABSURD_LENGTH),
    'no signature at all': payload,
    'extra dots': `${valid}.${signature}`,
  };
}

describe('a tampered session cookie', () => {
  it('is treated as no session on /me', async () => {
    for (const [name, token] of Object.entries(tamperedTokens())) {
      const response = await world.call('GET', '/me', { cookie: `${COOKIE_NAME}=${token}` });
      expect(response.status, name).toBe(401);
      expect(errorBodySchema.parse(response.body).error.kind, name).toBe('unauthenticated');
    }
  });

  it('is refused on a write with 401, never 500', async () => {
    const body = { designId: world.liveId, value: 1, reasons: [] };
    for (const [name, token] of Object.entries(tamperedTokens())) {
      const response = await world.call('POST', '/votes', {
        cookie: `${COOKIE_NAME}=${token}`,
        body,
      });
      expect(response.status, name).toBe(401);
    }
  });

  it('leaves public routes answering as for a guest', async () => {
    for (const [name, token] of Object.entries(tamperedTokens())) {
      const response = await world.call('GET', '/projects', { cookie: `${COOKIE_NAME}=${token}` });
      expect(response.status, name).toBe(200);
    }
  });

  it('cannot reach a staff route by claiming the staff role', async () => {
    const { payload, signature } = splitToken(tokenOf(world.cookies.residentB ?? ''));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object;
    const cookie = `${COOKIE_NAME}=${encode({ ...claims, role: 'staff' })}.${signature}`;
    const response = await world.call('GET', `/projects/${world.projectId}/insights`, { cookie });
    expect(response.status).toBe(401);
  });
});
