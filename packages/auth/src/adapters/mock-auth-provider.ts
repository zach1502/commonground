import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Clock } from '@parkshape/core';

import {
  readCookie,
  type AuthProvider,
  type CookieSecurity,
  type CreatedSession,
  type Session,
  type UserRole,
} from '../ports/auth-provider.js';

const SECONDS_PER_DAY = 86_400;
const SESSION_DAYS = 7;
/** How long a sign-in lasts: the cookie's Max-Age and the signed expiry both use it. */
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * SECONDS_PER_DAY;

export interface MockAuthProviderOptions {
  /** Signs every cookie; all API instances must share it (AUTH_SECRET in hosted runs). */
  readonly secret: string;
  /** Stamps and checks the expiry inside the signed payload. */
  readonly clock: Clock;
  readonly cookieSecurity: CookieSecurity;
  readonly maxAgeSeconds?: number;
}

const COOKIE_NAME = 'parkshape_session';
// Matches AUTH_SECRET's minimum, so a test secret cannot be weaker than a hosted one.
const MIN_SECRET_LENGTH = 32;
// A fresh nonce per sign-in keeps a revoked token from blocking the next sign-in.
const NONCE_BYTES = 16;
const MS_PER_SECOND = 1000;
const BASE_ATTRIBUTES = 'Path=/; HttpOnly; SameSite=Lax';
const ROLES: ReadonlySet<string> = new Set<UserRole>(['resident', 'staff']);

interface SignedClaims extends Session {
  /** Expiry in seconds since the epoch. */
  readonly exp: number;
}

function isClaims(value: unknown): value is SignedClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { userId, role, exp } = value as Record<string, unknown>;
  return (
    typeof userId === 'string' &&
    typeof role === 'string' &&
    ROLES.has(role) &&
    typeof exp === 'number' &&
    Number.isFinite(exp)
  );
}

function parseClaims(payload: string): SignedClaims | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isClaims(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Local sign-in for demos and tests: the cookie holds the session, signed with HMAC-SHA256.
 * Sign-outs are remembered in memory so a cleared cookie cannot be replayed on this instance.
 */
export class MockAuthProvider implements AuthProvider {
  readonly cookieName = COOKIE_NAME;
  private readonly revoked = new Set<string>();
  private readonly maxAgeSeconds: number;
  private readonly attributes: string;

  constructor(private readonly options: MockAuthProviderOptions) {
    if (options.secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`Mock auth secret must be at least ${String(MIN_SECRET_LENGTH)} characters`);
    }
    this.maxAgeSeconds = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
    this.attributes =
      options.cookieSecurity === 'secure' ? `${BASE_ATTRIBUTES}; Secure` : BASE_ATTRIBUTES;
  }

  /** Appends the signature to a payload; exposed so tests can forge well-signed bad payloads. */
  sign(payload: string): string {
    const signature = createHmac('sha256', this.options.secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  createSession(userId: string, role: UserRole): Promise<CreatedSession> {
    const session: Session = { userId, role };
    const nonce = randomBytes(NONCE_BYTES).toString('base64url');
    const exp = Math.floor(this.nowMs() / MS_PER_SECOND) + this.maxAgeSeconds;
    const payload = Buffer.from(JSON.stringify({ ...session, exp, nonce })).toString('base64url');
    const setCookie = `${COOKIE_NAME}=${this.sign(payload)}; ${this.attributes}; Max-Age=${String(this.maxAgeSeconds)}`;
    return Promise.resolve({ session, setCookie });
  }

  readSession(cookieHeader: string | undefined): Promise<Session | undefined> {
    const token = readCookie(cookieHeader, COOKIE_NAME);
    if (token === undefined || this.revoked.has(token)) {
      return Promise.resolve(undefined);
    }
    const [payload = ''] = token.split('.');
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(token);
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    const claims = valid ? parseClaims(payload) : undefined;
    if (claims === undefined || claims.exp * MS_PER_SECOND <= this.nowMs()) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ userId: claims.userId, role: claims.role });
  }

  destroySession(cookieHeader: string | undefined): Promise<{ readonly setCookie: string }> {
    const token = readCookie(cookieHeader, COOKIE_NAME);
    if (token !== undefined) {
      this.revoked.add(token);
    }
    return Promise.resolve({ setCookie: `${COOKIE_NAME}=; ${this.attributes}; Max-Age=0` });
  }

  private nowMs(): number {
    return this.options.clock.now().getTime();
  }
}
