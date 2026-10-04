import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Lets tests import workspace packages from src without building them first.
export const SOURCE_CONDITION = '@parkshape/source';
export const DEFAULT_COVERAGE_THRESHOLD = 80;
export const CORE_COVERAGE_THRESHOLD = 90;

export interface PackageTestOptions {
  readonly threshold?: number;
  // Test file globs. Defaults to the TS tests under src; JS-only tool packages pass their own.
  readonly include?: readonly string[];
  // Source globs measured for coverage. Defaults to the TS sources under src.
  readonly coverageInclude?: readonly string[];
  readonly environment?: 'node' | 'jsdom';
  readonly setupFiles?: readonly string[];
  readonly coverageExclude?: readonly string[];
  // Longer hooks for suites that start an embedded database in beforeAll.
  readonly hookTimeoutMs?: number;
  // Longer tests for suites that open an embedded database inside the test itself.
  readonly testTimeoutMs?: number;
  // Worker threads start faster than the default child processes. Each test file still gets a
  // fresh module graph, but threads share process.env, process.cwd() and native addons, so
  // only packages whose tests touch none of these opt in.
  readonly pool?: 'forks' | 'threads';
}

function coverageConfig(options: PackageTestOptions) {
  const threshold = options.threshold ?? DEFAULT_COVERAGE_THRESHOLD;
  return {
    provider: 'v8' as const,
    // The terminal table and the HTML report CI uploads. Vitest's default also writes clover and
    // JSON files, which nothing here reads and which cost a few seconds per package.
    reporter: ['text', 'html'],
    include: [...(options.coverageInclude ?? ['src/**/*.{ts,tsx}'])],
    exclude: ['**/*.test.{ts,tsx,js}', ...(options.coverageExclude ?? [])],
    thresholds: {
      lines: threshold,
      branches: threshold,
      functions: threshold,
      statements: threshold,
    },
  };
}

export function definePackageConfig(options: PackageTestOptions = {}): ViteUserConfig {
  return defineConfig({
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
    test: {
      include: [...(options.include ?? ['src/**/*.test.{ts,tsx}'])],
      pool: options.pool ?? 'forks',
      environment: options.environment ?? 'node',
      setupFiles: [...(options.setupFiles ?? [])],
      ...(options.hookTimeoutMs === undefined ? {} : { hookTimeout: options.hookTimeoutMs }),
      ...(options.testTimeoutMs === undefined ? {} : { testTimeout: options.testTimeoutMs }),
      coverage: coverageConfig(options),
    },
  });
}
