import type { Role, User } from '../api/web-api';
import type { SelfReportStore } from '../session/self-report';

import { PATHS } from './paths';

/** Where each role starts after logging in. */
export function homeFor(user: User): string {
  return user.role === 'staff' ? PATHS.staff : PATHS.projects;
}

/** The path to send someone to before a page for this audience, or null to let them in. */
export function guardRedirect(audience: Role, user: User | null): string | null {
  if (user === null) {
    return audience === 'staff' ? PATHS.staffLogin : PATHS.login;
  }
  return user.role === audience ? null : homeFor(user);
}

/** The query key that carries the task a person aimed at through login and the self-report. */
export const RETURN_TO_PARAM = 'returnTo';

/**
 * Keeps a returnTo only when it is a same-origin path: it starts with one slash and no scheme or
 * host. This blocks an open redirect to another site through a crafted query.
 */
export function safeReturnTo(value: string | null): string | null {
  if (value === null || value === '') return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

/** A path with the returnTo query added when the target is a safe same-origin path. */
function withReturnTo(path: string, returnTo: string | null): string {
  const safe = safeReturnTo(returnTo);
  return safe === null ? path : `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
}

/** The resident login path, carrying the task the visitor aimed at so login can return to it. */
export function loginRedirect(returnTo: string | null): string {
  return withReturnTo(PATHS.login, returnTo);
}

/**
 * Where a resident goes after login: the self-report once, then the task they aimed at, else
 * their home. The returnTo rides through the self-report so a skip never drops it.
 */
export function nextAfterLogin(
  user: User,
  selfReports: Pick<SelfReportStore, 'has'>,
  returnTo: string | null = null,
): string {
  if (user.role === 'resident' && !selfReports.has(user.id)) {
    return withReturnTo(PATHS.selfReport, returnTo);
  }
  if (user.role === 'resident') {
    return safeReturnTo(returnTo) ?? homeFor(user);
  }
  return homeFor(user);
}
