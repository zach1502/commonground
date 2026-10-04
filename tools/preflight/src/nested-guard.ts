import type { Exec } from './types.js';

/**
 * A preflight run sets this to its own PID for the tools it spawns. A nested preflight skips
 * itself only when that PID is one of its ancestors, so the variable cannot switch preflight
 * off when set by hand or in CI.
 */
export const NESTED_ENV = 'PARKSHAPE_PREFLIGHT_PARENT_PID';
export const MAX_ANCESTOR_LEVELS = 5;
const PID = /^\d+$/;

export type NestedVerdict = 'none' | 'nested' | 'spoofed';

async function parentOf(pid: number, exec: Exec): Promise<number | undefined> {
  try {
    const result = await exec('ps', ['-o', 'ppid=', '-p', String(pid)]);
    const text = result.stdout.trim();
    return result.code === 0 && PID.test(text) ? Number(text) : undefined;
  } catch {
    // Some sandboxes refuse to start ps at all (EPERM); then only the direct parent counts.
    return undefined;
  }
}

/**
 * True when `target` is `ppid` or one of its ancestors, up to MAX_ANCESTOR_LEVELS in all.
 * The walk uses `ps`; when `ps` fails, only the direct parent counts.
 */
export async function isAncestorPid(target: number, ppid: number, exec: Exec): Promise<boolean> {
  let current: number | undefined = ppid;
  for (let level = 1; current !== undefined && level <= MAX_ANCESTOR_LEVELS; level += 1) {
    if (current === target) {
      return true;
    }
    current = level < MAX_ANCESTOR_LEVELS ? await parentOf(current, exec) : undefined;
  }
  return false;
}

/** Whether this run was started by a parent preflight, not at all, or by a stray variable. */
export async function nestedVerdict(
  env: Readonly<Record<string, string | undefined>>,
  ppid: number,
  exec: Exec,
): Promise<NestedVerdict> {
  const value = env[NESTED_ENV]?.trim() ?? '';
  if (value === '') {
    return 'none';
  }
  if (!PID.test(value)) {
    return 'spoofed';
  }
  return (await isAncestorPid(Number(value), ppid, exec)) ? 'nested' : 'spoofed';
}
