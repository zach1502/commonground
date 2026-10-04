import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Vitest runs in apps/web, so the repo root is two levels up.
const REPO_ROOT = resolve(process.cwd(), '../..');
// Stands in for turbo and pnpm. It logs the command, whether AI_API_KEY is set and the values of
// PARKSHAPE_OFFLINE and VITE_MAP_TILES, and never the key itself.
const STAND_IN = [
  '#!/bin/sh',
  'key=unset',
  'if [ -n "${AI_API_KEY:-}" ]; then key=set; fi',
  'echo "$(basename "$0") $* key=$key offline=${PARKSHAPE_OFFLINE:-} tiles=${VITE_MAP_TILES:-}" >> "$STEP_LOG"',
  '',
].join('\n');
const GEMINI_ENV_FILE = 'AI_API_KEY=not-a-real-key\nPARKSHAPE_OFFLINE=0\n';
const DEV_SERVERS = 'pnpm --parallel --filter @parkshape/api --filter @parkshape/web run dev';

let repo = '';

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'dev-local-'));
  mkdirSync(join(repo, 'tools'));
  mkdirSync(join(repo, 'bin'));
  copyFileSync(resolve(REPO_ROOT, 'tools/dev-local.sh'), join(repo, 'tools/dev-local.sh'));
  for (const name of ['turbo', 'pnpm']) {
    writeFileSync(join(repo, 'bin', name), STAND_IN);
    chmodSync(join(repo, 'bin', name), 0o755);
  }
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Runs a copy of tools/dev-local.sh and returns one line per turbo or pnpm call, in order. */
function runDevLocal(options: { envFile?: string; shell?: Record<string, string> }): string[] {
  if (options.envFile !== undefined) {
    writeFileSync(join(repo, '.env'), options.envFile);
  }
  const log = join(repo, 'steps.log');
  execFileSync('sh', [join(repo, 'tools/dev-local.sh')], {
    env: { ...options.shell, PATH: `${join(repo, 'bin')}:/usr/bin:/bin`, STEP_LOG: log },
  });
  return readFileSync(log, 'utf8').trim().split('\n');
}

describe('pnpm dev:local', () => {
  it('builds before it reads .env, so the key stays out of the build', () => {
    expect(runDevLocal({ envFile: GEMINI_ENV_FILE })[0]).toMatch(
      /^turbo run build --output-logs=errors-only key=unset /,
    );
  });

  it('seeds with outbound requests blocked, whatever .env says', () => {
    expect(runDevLocal({ envFile: GEMINI_ENV_FILE })[1]).toBe(
      'pnpm run --if-present seed key=set offline=1 tiles=osm-raster',
    );
  });

  it('gives the dev servers the .env key and PARKSHAPE_OFFLINE=0, so the API can reach Gemini', () => {
    expect(runDevLocal({ envFile: GEMINI_ENV_FILE })[2]).toBe(
      `${DEV_SERVERS} key=set offline=0 tiles=osm-raster`,
    );
  });

  it('blocks outbound requests with no .env, even when the shell sets PARKSHAPE_OFFLINE=0', () => {
    expect(runDevLocal({ shell: { PARKSHAPE_OFFLINE: '0' } })).toEqual([
      'turbo run build --output-logs=errors-only key=unset offline= tiles=',
      'pnpm run --if-present seed key=unset offline=1 tiles=osm-raster',
      `${DEV_SERVERS} key=unset offline=1 tiles=osm-raster`,
    ]);
  });

  it('serves the OpenStreetMap basemap, which the new project wizard needs to find a park', () => {
    expect(runDevLocal({})[2]).toMatch(/ tiles=osm-raster$/);
  });

  it('lets .env choose the plain map fill for a fully offline run', () => {
    expect(runDevLocal({ envFile: 'VITE_MAP_TILES=static\n' })[2]).toMatch(/ tiles=static$/);
  });
});

describe('the e2e API servers', () => {
  it.each(['playwright.config.ts', 'apps/web/playwright.config.ts'])(
    'answer with the fixed rules and block outbound requests in %s',
    (config) => {
      const text = readFileSync(resolve(REPO_ROOT, config), 'utf8');
      expect(text).toContain("AI_PROVIDER: 'rule-based'");
      expect(text).toContain("PARKSHAPE_OFFLINE: '1'");
    },
  );
});
