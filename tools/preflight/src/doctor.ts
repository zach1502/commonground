import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { fileExists, readText } from './files.js';
import { envFindings } from './rules/env-documented.js';
import type { Exec, Finding } from './types.js';

export const HOOKS = ['.husky/pre-commit', '.husky/pre-push', '.husky/commit-msg'];
const EXECUTABLE_BITS = 0o111;
const PACKAGE_MANAGER = /"packageManager"\s*:\s*"pnpm@([^"+]+)/;

export interface DoctorInput {
  readonly rootDir: string;
  readonly exec: Exec;
  readonly nodeVersion: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const MAJOR_MINOR_PARTS = 2;

function majorMinor(version: string): string {
  return version.replace(/^v/, '').split('.').slice(0, MAJOR_MINOR_PARTS).join('.');
}

function checkNode({ rootDir, nodeVersion }: DoctorInput): Finding[] {
  if (!fileExists(rootDir, '.nvmrc')) {
    return [{ ruleId: 'doctor:node', file: '.nvmrc', message: '.nvmrc is missing' }];
  }
  const wanted = readText(rootDir, '.nvmrc').trim();
  return majorMinor(wanted) === majorMinor(nodeVersion)
    ? []
    : [
        {
          ruleId: 'doctor:node',
          message: `Node ${nodeVersion} is running; .nvmrc wants ${wanted}`,
        },
      ];
}

async function checkPnpm({ rootDir, exec, env }: DoctorInput): Promise<Finding[]> {
  const manifest = fileExists(rootDir, 'package.json') ? readText(rootDir, 'package.json') : '';
  const wanted = PACKAGE_MANAGER.exec(manifest)?.[1];
  if (wanted === undefined) {
    return [
      { ruleId: 'doctor:pnpm', file: 'package.json', message: 'packageManager does not name pnpm' },
    ];
  }
  const result = await exec('pnpm', ['--version'], { cwd: rootDir, env });
  const running = result.stdout.trim();
  if (result.code !== 0) {
    return [{ ruleId: 'doctor:pnpm', message: 'pnpm is not on PATH; run corepack enable' }];
  }
  return running === wanted
    ? []
    : [
        {
          ruleId: 'doctor:pnpm',
          message: `pnpm ${running} is running; packageManager wants ${wanted}`,
        },
      ];
}

function checkHooks({ rootDir }: DoctorInput): Finding[] {
  return HOOKS.flatMap((hook): Finding[] => {
    if (!fileExists(rootDir, hook)) {
      return [{ ruleId: 'doctor:hooks', file: hook, message: 'hook is missing; run pnpm install' }];
    }
    const mode = statSync(path.join(rootDir, hook)).mode;
    return (mode & EXECUTABLE_BITS) === 0
      ? [{ ruleId: 'doctor:hooks', file: hook, message: 'hook is not executable; run chmod +x' }]
      : [];
  });
}

function browserCacheDirs(env: DoctorInput['env']): string[] {
  const custom = env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom !== undefined && custom !== '') {
    return [custom];
  }
  const home = homedir();
  return [
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    path.join(home, '.cache', 'ms-playwright'),
    path.join(env.LOCALAPPDATA ?? home, 'ms-playwright'),
  ];
}

function checkPlaywright({ rootDir, env }: DoctorInput): Finding[] {
  if (!fileExists(rootDir, 'node_modules/@playwright/test')) {
    return [];
  }
  const installed = browserCacheDirs(env).some((dir) => fileExists(dir, '.'));
  return installed
    ? []
    : [
        {
          ruleId: 'doctor:playwright',
          message: 'Playwright browsers are missing; run pnpm exec playwright install',
        },
      ];
}

/** Checks the local setup: Node, pnpm, git hooks, env documentation and Playwright browsers. */
export async function runDoctor(input: DoctorInput): Promise<Finding[]> {
  return [
    ...checkNode(input),
    ...(await checkPnpm(input)),
    ...checkHooks(input),
    ...envFindings(input.rootDir, 'doctor:env'),
    ...checkPlaywright(input),
  ];
}

export const DOCTOR_CHECKS: readonly { id: string; summary: string; fixHint: string }[] = [
  {
    id: 'doctor:node',
    summary: 'Node major.minor matches .nvmrc.',
    fixHint: 'Install the Node version in .nvmrc.',
  },
  {
    id: 'doctor:pnpm',
    summary: 'pnpm matches packageManager.',
    fixHint: 'Run npx corepack@0.34.7 corepack enable.',
  },
  {
    id: 'doctor:hooks',
    summary: 'Husky hooks exist and are executable.',
    fixHint: 'Run pnpm install.',
  },
  {
    id: 'doctor:env',
    summary: 'The env schema and .env.example match.',
    fixHint: 'Add the key to both files.',
  },
  {
    id: 'doctor:playwright',
    summary: 'Playwright browsers are installed.',
    fixHint: 'Run pnpm exec playwright install.',
  },
];
