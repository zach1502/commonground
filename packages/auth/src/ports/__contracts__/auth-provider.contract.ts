import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import type { AuthProvider, CookieSecurity } from '../auth-provider.js';

const START = new Date('2026-09-25T09:00:00.000Z');
const SECOND_MS = 1000;
// The contract fixes one session length so every adapter is held to the same expiry check.
export const CONTRACT_MAX_AGE_SECONDS = 3600;

export interface AuthProviderFactoryOptions {
  readonly clock: FakeClock;
  readonly cookieSecurity: CookieSecurity;
  readonly maxAgeSeconds: number;
}

/** Turns a Set-Cookie value into the Cookie header a browser would send back. */
export function cookieHeaderFrom(setCookie: string): string {
  return setCookie.split(';')[0] ?? '';
}

type MakeProvider = (cookieSecurity?: CookieSecurity) => AuthProvider;

/** Cookie attributes and expiry: Max-Age, Secure on request, and the signed expiry. */
function sessionLifetimeContract(makeProvider: MakeProvider, clock: FakeClock): void {
  it('sets Max-Age to the session length', async () => {
    const { setCookie } = await makeProvider().createSession('user-1', 'resident');
    expect(setCookie).toMatch(new RegExp(`Max-Age=${String(CONTRACT_MAX_AGE_SECONDS)}(;|$)`));
  });

  it('adds Secure only when asked to', async () => {
    const secure = await makeProvider('secure').createSession('user-1', 'resident');
    expect(secure.setCookie).toMatch(/; Secure(;|$)/);
    expect((await makeProvider('secure').destroySession(undefined)).setCookie).toMatch(/Secure/);
    const plain = await makeProvider('insecure').createSession('user-1', 'resident');
    expect(plain.setCookie).not.toMatch(/Secure/);
  });

  it('accepts a session until it expires and rejects it after', async () => {
    const provider = makeProvider();
    const { setCookie } = await provider.createSession('user-1', 'resident');
    const header = cookieHeaderFrom(setCookie);
    clock.advance(CONTRACT_MAX_AGE_SECONDS * SECOND_MS - SECOND_MS);
    expect(await provider.readSession(header)).toEqual({ userId: 'user-1', role: 'resident' });
    clock.advance(SECOND_MS);
    expect(await provider.readSession(header)).toBeUndefined();
  });
}

/** Sign-out clears the cookie and stops the old cookie from working. */
function signOutContract(makeProvider: MakeProvider): void {
  it('ends the session and clears the cookie', async () => {
    const provider = makeProvider();
    const { setCookie } = await provider.createSession('user-1', 'resident');
    const header = cookieHeaderFrom(setCookie);
    const cleared = await provider.destroySession(header);
    expect(cleared.setCookie).toMatch(/Max-Age=0/);
    expect(await provider.readSession(header)).toBeUndefined();
  });

  it('clears the cookie even when no session was sent', async () => {
    const cleared = await makeProvider().destroySession(undefined);
    expect(cleared.setCookie).toMatch(/Max-Age=0/);
  });
}

/** Behaviour every AuthProvider adapter must have. Each adapter test calls this with a factory. */
export function authProviderContract(
  name: string,
  factory: (options: AuthProviderFactoryOptions) => AuthProvider,
): void {
  const clock = new FakeClock(START);
  const makeProvider: MakeProvider = (cookieSecurity = 'insecure') =>
    factory({ clock, cookieSecurity, maxAgeSeconds: CONTRACT_MAX_AGE_SECONDS });

  describe(`${name} meets the AuthProvider contract`, () => {
    sessionLifetimeContract(makeProvider, clock);
    signOutContract(makeProvider);

    it('reads back the session it created', async () => {
      const provider = makeProvider();
      const { session, setCookie } = await provider.createSession('user-1', 'resident');
      expect(session).toEqual({ userId: 'user-1', role: 'resident' });
      expect(await provider.readSession(cookieHeaderFrom(setCookie))).toEqual(session);
    });

    it('marks the cookie HttpOnly with a path and SameSite', async () => {
      const { setCookie } = await makeProvider().createSession('user-1', 'staff');
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).toMatch(/SameSite=Lax/);
    });

    it('finds its cookie among other cookies', async () => {
      const provider = makeProvider();
      const { setCookie } = await provider.createSession('user-2', 'staff');
      const header = `theme=dark; ${cookieHeaderFrom(setCookie)}; other=1`;
      expect(await provider.readSession(header)).toEqual({ userId: 'user-2', role: 'staff' });
    });

    it('returns undefined with no cookie or an unknown cookie', async () => {
      const provider = makeProvider();
      expect(await provider.readSession(undefined)).toBeUndefined();
      expect(await provider.readSession('')).toBeUndefined();
      expect(await provider.readSession(`${provider.cookieName}=garbage`)).toBeUndefined();
    });

    it('rejects a cookie whose value was changed', async () => {
      const provider = makeProvider();
      const { setCookie } = await provider.createSession('user-1', 'resident');
      const [prefix = '', signature = ''] = cookieHeaderFrom(setCookie).split('.');
      const flipped = signature.startsWith('A')
        ? `B${signature.slice(1)}`
        : `A${signature.slice(1)}`;
      expect(await provider.readSession(`${prefix}.${flipped}`)).toBeUndefined();
    });
  });
}
