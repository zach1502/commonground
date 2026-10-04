import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// vite.config.ts imports vote-preload.ts, which imports @parkshape/core. Vite bundles the config
// with esbuild but leaves package imports to Node, and Node loads core from dist, not src. On a
// fresh clone there is no dist, so every command that starts Vite for this app must build the
// workspace packages first. `tsc -b` does it through the tsconfig references, and turbo does it
// through `^build`. Vitest runs in apps/web, so the paths below are relative to it.
const REPO_ROOT = resolve(process.cwd(), '../..');

function read(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function scripts(path: string): Record<string, string> {
  return (JSON.parse(read(path)) as { scripts: Record<string, string> }).scripts;
}

describe('commands that start Vite for the web app', () => {
  it('build the workspace packages in the dev and build scripts before Vite loads its config', () => {
    const web = scripts('apps/web/package.json');
    expect(web.dev).toBe('tsc -b && vite');
    expect(web.build).toBe('tsc -b && vite build');
  });

  it.each(['playwright.config.ts', 'apps/web/playwright.config.ts'])(
    'build the web app through its build script in the %s web server',
    (config) => {
      const text = read(config);
      expect(text).toContain('`pnpm run build && pnpm exec vite preview --port');
      expect(text).not.toContain('exec vite build');
    },
  );

  it('build every package before the dev servers start in pnpm dev and pnpm dev:local', () => {
    const turbo = JSON.parse(read('turbo.json')) as {
      tasks: { dev: { dependsOn?: readonly string[] } };
    };
    expect(turbo.tasks.dev.dependsOn).toEqual(['^build']);
    // dev:local runs tools/dev-local.sh, which runs one command per line.
    expect(scripts('package.json')['dev:local']).toBe('sh tools/dev-local.sh');
    const lines = read('tools/dev-local.sh').split('\n');
    const build = lines.indexOf('turbo run build --output-logs=errors-only');
    const dev = lines.findIndex((line) => line.endsWith(' run dev'));
    expect(build).toBeGreaterThan(-1);
    expect(dev).toBeGreaterThan(build);
  });
});
