/** Who may do what: residents design and vote, staff also run projects. */
export type UserRole = 'resident' | 'staff';

/** Whether the session cookie carries the Secure attribute, so browsers send it over https only. */
export type CookieSecurity = 'secure' | 'insecure';

export interface Session {
  readonly userId: string;
  readonly role: UserRole;
}

export interface CreatedSession {
  readonly session: Session;
  readonly setCookie: string;
}

/** Signs people in and out through a session cookie. */
export interface AuthProvider {
  readonly cookieName: string;
  createSession(userId: string, role: UserRole): Promise<CreatedSession>;
  readSession(cookieHeader: string | undefined): Promise<Session | undefined>;
  destroySession(cookieHeader: string | undefined): Promise<{ readonly setCookie: string }>;
}

/** The value of one cookie in a Cookie request header. */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  return (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}
