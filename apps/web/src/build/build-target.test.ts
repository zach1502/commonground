import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTarget } from './build-target';

// Vitest runs in apps/web. Importing vite.config.ts loads esbuild, which fails under jsdom, so
// the last test reads the file.
const REPO_ROOT = resolve(process.cwd(), '../..');
const VITE_CONFIG = resolve(process.cwd(), 'vite.config.ts');
const ROOT_PACKAGE = resolve(REPO_ROOT, 'package.json');
const SUPPORTED_ENGINE = /^(chrome|edge|firefox|safari)\d+(\.\d+)*$/;

function rootBrowserslist(): unknown {
  return (JSON.parse(readFileSync(ROOT_PACKAGE, 'utf8')) as { browserslist?: unknown })
    .browserslist;
}

describe('buildTarget', () => {
  it('reads the last 2 versions of Chrome, Edge, Firefox and Safari from the root package.json', () => {
    expect(rootBrowserslist()).toEqual([
      'last 2 Chrome versions',
      'last 2 Edge versions',
      'last 2 Firefox versions',
      'last 2 Safari versions',
    ]);
  });

  it('turns the browser list into esbuild targets for those 4 browsers only', () => {
    const target = buildTarget(REPO_ROOT);
    expect(target.every((engine) => SUPPORTED_ENGINE.test(engine))).toBe(true);
    const engines = new Set(target.map((engine) => engine.replace(/[\d.]+$/, '')));
    expect([...engines].sort()).toEqual(['chrome', 'edge', 'firefox', 'safari']);
  });

  it('is the build target in the Vite config', () => {
    expect(readFileSync(VITE_CONFIG, 'utf8')).toMatch(
      /build: \{\s*target: buildTarget\(REPO_ROOT\),/,
    );
  });
});
