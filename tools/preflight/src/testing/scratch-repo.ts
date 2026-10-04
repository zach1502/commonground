import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnExec } from '../exec.js';
import type { Exec } from '../types.js';

// Fixed identity and no signing, so commits work on any machine and in CI.
const GIT_CONFIG = [
  '-c',
  'user.name=Preflight Test',
  '-c',
  'user.email=preflight@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

/**
 * The test's env without GIT_* variables. Git hooks set GIT_DIR and GIT_INDEX_FILE, and
 * those would point the scratch commands at the real repo.
 */
function scratchEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

const scratchExec: Exec = (command, args, options = {}) =>
  spawnExec(command, args, { ...options, env: { ...scratchEnv(), ...options.env } });

/** Scratch repo tests spawn many git processes, which is slow on a busy machine. */
export const SCRATCH_TIMEOUT_MS = 30_000;

export interface ScratchRepo {
  readonly rootDir: string;
  readonly exec: Exec;
  write(file: string, text?: string): void;
  git(...args: string[]): Promise<string>;
  /** Stages every change and commits it; returns the new commit id. */
  commit(message: string): Promise<string>;
}

/** A throwaway git repo in a temp dir, for tests that need real git history. */
export async function createScratchRepo(): Promise<ScratchRepo> {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-git-'));
  const git = async (...args: string[]): Promise<string> => {
    const result = await scratchExec('git', [...GIT_CONFIG, ...args], { cwd: rootDir });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  await git('init', '--quiet', '--initial-branch=main');
  return {
    rootDir,
    exec: scratchExec,
    write(file, text = `export const value = '${file}';\n`) {
      mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
      writeFileSync(path.join(rootDir, file), text);
    },
    git,
    async commit(message) {
      await git('add', '--all');
      await git('commit', '--quiet', '--allow-empty', '-m', message);
      return git('rev-parse', 'HEAD');
    },
  };
}
