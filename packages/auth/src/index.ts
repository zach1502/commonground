import { isLocalOrigin, type AppConfig } from '@parkshape/config';

import type { CookieSecurity } from './ports/auth-provider.js';

// Providers that simulate sign-in locally. AUTH_PROVIDER only allows 'mock' today, so a
// direct comparison would always be true; the set keeps the check meaningful as it grows.
const LOCAL_AUTH_PROVIDERS: ReadonlySet<string> = new Set(['mock']);

/** True when sign-in is simulated locally rather than delegated to an identity provider. */
export function isMockAuth(config: Pick<AppConfig, 'AUTH_PROVIDER'>): boolean {
  return LOCAL_AUTH_PROVIDERS.has(config.AUTH_PROVIDER);
}

/** Secure unless forced off, or on auto the web origin is a local host. */
export function sessionCookieSecurity(
  config: Pick<AppConfig, 'CORS_ORIGIN' | 'AUTH_COOKIE_SECURE'>,
): CookieSecurity {
  switch (config.AUTH_COOKIE_SECURE) {
    case 'on':
      return 'secure';
    case 'off':
      return 'insecure';
    case 'auto':
      return isLocalOrigin(config.CORS_ORIGIN) ? 'insecure' : 'secure';
  }
}

export { readCookie } from './ports/auth-provider.js';
export type {
  AuthProvider,
  CookieSecurity,
  CreatedSession,
  Session,
  UserRole,
} from './ports/auth-provider.js';
export { MockAuthProvider, SESSION_MAX_AGE_SECONDS } from './adapters/mock-auth-provider.js';
export type { MockAuthProviderOptions } from './adapters/mock-auth-provider.js';
export { PERSONAS, findPersona } from './personas.js';
export type { Persona } from './personas.js';
