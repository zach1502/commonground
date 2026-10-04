import { createHash, timingSafeEqual } from 'node:crypto';

import type { Persona } from '@parkshape/auth';
import type { AppConfig } from '@parkshape/config';

import { accessCodeRefused } from '../errors.js';

type StaffAccessConfig = Pick<AppConfig, 'STAFF_ACCESS_CODE' | 'staffLoginMode'>;

// Hashing first gives both sides the same length, so the compare takes the same time whatever
// the length of the guess.
function digest(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

function sameCode(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/** Throws unless the persona may log in: residents always, staff with the code when asked. */
export function checkStaffAccess(
  config: StaffAccessConfig,
  persona: Persona,
  accessCode: string | undefined,
): void {
  if (persona.role !== 'staff' || config.staffLoginMode === 'open') {
    return;
  }
  if (!sameCode(accessCode ?? '', config.STAFF_ACCESS_CODE)) {
    throw accessCodeRefused();
  }
}
