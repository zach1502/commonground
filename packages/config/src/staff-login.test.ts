import { describe, expect, it } from 'vitest';

import { isLocalOrigin, loadConfig } from './index.js';

const HOSTED_ORIGIN = 'https://parkshape.example.ca';
const ACCESS_CODE = 'harbour-otter-42';

describe('isLocalOrigin', () => {
  it('is true for localhost, 127.0.0.1 and [::1] and false for other hosts', () => {
    expect(isLocalOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:4173')).toBe(true);
    expect(isLocalOrigin('http://[::1]:5173')).toBe(true);
    expect(isLocalOrigin(HOSTED_ORIGIN)).toBe(false);
    expect(isLocalOrigin('http://localhost.example.test')).toBe(false);
  });
});

describe('loadConfig for the staff login', () => {
  it('leaves staff login open on a local origin with no access code', () => {
    const config = loadConfig({});
    expect(config.STAFF_ACCESS_CODE).toBe('');
    expect(config.staffLoginMode).toBe('open');
    expect(loadConfig({ CORS_ORIGIN: 'http://127.0.0.1:4173' }).staffLoginMode).toBe('open');
  });

  it('asks for the code on a hosted origin once STAFF_ACCESS_CODE is set', () => {
    const config = loadConfig({ CORS_ORIGIN: HOSTED_ORIGIN, STAFF_ACCESS_CODE: ACCESS_CODE });
    expect(config.staffLoginMode).toBe('code');
    expect(config.STAFF_ACCESS_CODE).toBe(ACCESS_CODE);
  });

  it('asks for the code on a local origin when STAFF_ACCESS_CODE is set', () => {
    expect(loadConfig({ STAFF_ACCESS_CODE: ACCESS_CODE }).staffLoginMode).toBe('code');
  });

  it('fails fast with a plain message on a hosted origin with no access code', () => {
    expect(() => loadConfig({ CORS_ORIGIN: HOSTED_ORIGIN })).toThrow(
      /STAFF_ACCESS_CODE is required when CORS_ORIGIN is not localhost/,
    );
    expect(() => loadConfig({ CORS_ORIGIN: HOSTED_ORIGIN, STAFF_ACCESS_CODE: '' })).toThrow(
      /STAFF_ACCESS_CODE/,
    );
  });

  it('rejects an access code shorter than 8 characters', () => {
    expect(() => loadConfig({ STAFF_ACCESS_CODE: 'short12' })).toThrow(/STAFF_ACCESS_CODE/);
    expect(loadConfig({ STAFF_ACCESS_CODE: '12345678' }).staffLoginMode).toBe('code');
  });
});
