import { describe, expect, it } from 'vitest';

import { RESIDENT, STAFF } from '../test/api-server';

import { guardRedirect, homeFor, loginRedirect, nextAfterLogin, safeReturnTo } from './guards';
import { PATHS } from './paths';

describe('homeFor', () => {
  it('sends residents to projects and staff to the staff home', () => {
    expect(homeFor(RESIDENT)).toBe(PATHS.projects);
    expect(homeFor(STAFF)).toBe(PATHS.staff);
  });
});

describe('guardRedirect', () => {
  it('sends a signed-out visitor to the login for the audience', () => {
    expect(guardRedirect('resident', null)).toBe(PATHS.login);
    expect(guardRedirect('staff', null)).toBe(PATHS.staffLogin);
  });

  it('sends the wrong role to its own home', () => {
    expect(guardRedirect('staff', RESIDENT)).toBe(PATHS.projects);
    expect(guardRedirect('resident', STAFF)).toBe(PATHS.staff);
  });

  it('lets the right role through', () => {
    expect(guardRedirect('resident', RESIDENT)).toBeNull();
    expect(guardRedirect('staff', STAFF)).toBeNull();
  });
});

describe('nextAfterLogin', () => {
  it('asks a resident for the self-report once', () => {
    expect(nextAfterLogin(RESIDENT, { has: () => false })).toBe(PATHS.selfReport);
    expect(nextAfterLogin(RESIDENT, { has: () => true })).toBe(PATHS.projects);
  });

  it('never asks staff', () => {
    expect(nextAfterLogin(STAFF, { has: () => false })).toBe(PATHS.staff);
  });

  it('carries a same-origin returnTo through the self-report', () => {
    const vote = '/projects/p1/vote';
    expect(nextAfterLogin(RESIDENT, { has: () => false }, vote)).toBe(
      `${PATHS.selfReport}?returnTo=${encodeURIComponent(vote)}`,
    );
  });

  it('sends a returning resident who has answered straight to the task', () => {
    const vote = '/projects/p1/vote';
    expect(nextAfterLogin(RESIDENT, { has: () => true }, vote)).toBe(vote);
  });

  it('ignores an off-site returnTo and falls back to the home', () => {
    expect(nextAfterLogin(RESIDENT, { has: () => true }, 'https://evil.test')).toBe(PATHS.projects);
    expect(nextAfterLogin(RESIDENT, { has: () => true }, '//evil.test')).toBe(PATHS.projects);
  });
});

describe('safeReturnTo', () => {
  it('keeps a same-origin path', () => {
    expect(safeReturnTo('/projects/p1/vote')).toBe('/projects/p1/vote');
  });

  it('rejects a scheme, a host and an empty value', () => {
    expect(safeReturnTo('https://evil.test')).toBeNull();
    expect(safeReturnTo('//evil.test')).toBeNull();
    expect(safeReturnTo('/\\evil.test')).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });
});

describe('loginRedirect', () => {
  it('adds a safe returnTo as a query and drops an unsafe one', () => {
    expect(loginRedirect('/projects/p1/vote')).toBe(
      `${PATHS.login}?returnTo=${encodeURIComponent('/projects/p1/vote')}`,
    );
    expect(loginRedirect('https://evil.test')).toBe(PATHS.login);
    expect(loginRedirect(null)).toBe(PATHS.login);
  });
});
