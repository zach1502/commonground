import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HOOKS, runDoctor } from './doctor.js';
import { fakeExec, fixtureDir } from './testing/fixture-context.js';

const EXECUTABLE = 0o755;
const READ_ONLY = 0o644;

function setupRepo(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-doctor-'));
  cpSync(fixtureDir('env-documented', 'pass'), rootDir, { recursive: true });
  writeFileSync(path.join(rootDir, '.nvmrc'), '20.18.1\n');
  writeFileSync(path.join(rootDir, 'package.json'), '{ "packageManager": "pnpm@12.6.0" }\n');
  mkdirSync(path.join(rootDir, '.husky'));
  for (const hook of HOOKS) {
    writeFileSync(path.join(rootDir, hook), 'exit 0\n');
    chmodSync(path.join(rootDir, hook), EXECUTABLE);
  }
  return rootDir;
}

const PNPM_OK = fakeExec({ code: 0, stdout: '12.6.0\n' });

describe('runDoctor', () => {
  it('passes a matching setup', async () => {
    const findings = await runDoctor({
      rootDir: setupRepo(),
      exec: PNPM_OK,
      nodeVersion: 'v20.18.3',
      env: {},
    });
    expect(findings).toEqual([]);
  });

  it('reports version drift, a missing hook and a hook that cannot run', async () => {
    const rootDir = setupRepo();
    chmodSync(path.join(rootDir, '.husky/pre-push'), READ_ONLY);
    const other = fakeExec({ code: 0, stdout: '9.0.0\n' });
    const ids = (await runDoctor({ rootDir, exec: other, nodeVersion: 'v22.1.0', env: {} })).map(
      ({ ruleId }) => ruleId,
    );
    expect(ids).toEqual(['doctor:node', 'doctor:pnpm', 'doctor:hooks']);
  });

  it('reports missing pnpm, missing files and missing Playwright browsers', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-doctor-empty-'));
    writeFileSync(path.join(rootDir, 'package.json'), '{}\n');
    mkdirSync(path.join(rootDir, 'node_modules/@playwright/test'), { recursive: true });
    const env = { PLAYWRIGHT_BROWSERS_PATH: path.join(rootDir, 'no-browsers') };
    const ids = (await runDoctor({ rootDir, exec: fakeExec(), nodeVersion: 'v20.18.1', env })).map(
      ({ ruleId }) => ruleId,
    );
    expect(ids).toEqual([
      'doctor:node',
      'doctor:pnpm',
      'doctor:hooks',
      'doctor:hooks',
      'doctor:hooks',
      'doctor:env',
      'doctor:env',
      'doctor:playwright',
    ]);
  });

  it('reports pnpm missing from PATH', async () => {
    const findings = await runDoctor({
      rootDir: setupRepo(),
      exec: fakeExec(),
      nodeVersion: 'v20.18.1',
      env: {},
    });
    expect(findings.map(({ message }) => message)).toEqual([
      'pnpm is not on PATH; run corepack enable',
    ]);
  });
});
