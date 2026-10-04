import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';

import { isMockAuth, sessionCookieSecurity } from './index.js';

describe('isMockAuth', () => {
  it('is true for the default config', () => {
    const config = loadConfig({});
    expect(config.AUTH_PROVIDER).toBe('mock');
    expect(isMockAuth(config)).toBe(true);
  });
});

describe('sessionCookieSecurity', () => {
  const on = (origin: string, setting: 'auto' | 'on' | 'off' = 'auto') =>
    sessionCookieSecurity({ CORS_ORIGIN: origin, AUTH_COOKIE_SECURE: setting });

  it('marks the cookie Secure for a hosted origin', () => {
    expect(on('https://parkshape.vercel.app')).toBe('secure');
  });

  it('leaves Secure off for localhost, 127.0.0.1 and [::1] so plain http dev works', () => {
    expect(on('http://localhost:5173')).toBe('insecure');
    expect(on('http://127.0.0.1:4173')).toBe('insecure');
    expect(on('http://[::1]:5173')).toBe('insecure');
  });

  it('follows AUTH_COOKIE_SECURE when it is on or off', () => {
    expect(on('http://localhost:5173', 'on')).toBe('secure');
    expect(on('https://parkshape.vercel.app', 'off')).toBe('insecure');
  });
});
