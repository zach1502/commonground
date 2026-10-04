import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import {
  authProviderContract,
  cookieHeaderFrom,
} from '../ports/__contracts__/auth-provider.contract.js';

import { MockAuthProvider, SESSION_MAX_AGE_SECONDS } from './mock-auth-provider.js';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';
const clock = new FakeClock(new Date('2026-09-25T09:00:00.000Z'));
const SEVEN_DAYS_SECONDS = 604_800;

function mock(secret = SECRET): MockAuthProvider {
  return new MockAuthProvider({ secret, clock, cookieSecurity: 'insecure' });
}

authProviderContract(
  'MockAuthProvider',
  (options) => new MockAuthProvider({ secret: SECRET, ...options }),
);

describe('MockAuthProvider', () => {
  it('rejects a cookie signed with another secret', async () => {
    const signer = mock('another-secret-value-that-is-long-enough');
    const { setCookie } = await signer.createSession('user-1', 'staff');
    const reader = mock();
    expect(await reader.readSession(cookieHeaderFrom(setCookie))).toBeUndefined();
  });

  it('rejects a signed payload that is not a session', async () => {
    const provider = mock();
    const forged = provider.sign(Buffer.from('{"userId":7}').toString('base64url'));
    expect(await provider.readSession(`${provider.cookieName}=${forged}`)).toBeUndefined();
  });

  it('accepts a new sign-in after the same person signs out', async () => {
    const provider = mock();
    const first = await provider.createSession('user-1', 'resident');
    await provider.destroySession(cookieHeaderFrom(first.setCookie));
    const second = await provider.createSession('user-1', 'resident');
    expect(await provider.readSession(cookieHeaderFrom(second.setCookie))).toEqual({
      userId: 'user-1',
      role: 'resident',
    });
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(() => mock('a'.repeat(31))).toThrow(/secret/);
  });

  it('keeps a session for 7 days by default', async () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(SEVEN_DAYS_SECONDS);
    const { setCookie } = await mock().createSession('user-1', 'resident');
    expect(setCookie).toMatch(/Max-Age=604800/);
  });

  it('rejects a well-signed session with no expiry', async () => {
    const provider = mock();
    const payload = Buffer.from('{"userId":"user-1","role":"staff"}').toString('base64url');
    expect(await provider.readSession(`${provider.cookieName}=${provider.sign(payload)}`)).toBe(
      undefined,
    );
  });
});
