import {
  DEFAULT_API_URL,
  DEFAULT_EDITOR_TEST_HOOK,
  DEFAULT_FLAG,
  DEFAULT_MAP_TILES,
  DEFAULT_POLL_INTERVAL_MS,
  EDITOR_TEST_HOOK_VALUES,
  FLAG_VALUES,
  MAP_TILES_VALUES,
} from './defaults.js';

// The browser parses its six VITE_ keys by hand, so the web entry chunk does not ship zod.
// browser.test.ts checks that every result matches the zod browserEnvSchema in env.ts.

export type EnvSource = Record<string, string | undefined>;

export interface BrowserConfig {
  readonly VITE_API_URL: string;
  readonly VITE_POLL_INTERVAL_MS: number;
  readonly VITE_EDITOR_TEST_HOOK: (typeof EDITOR_TEST_HOOK_VALUES)[number];
  readonly VITE_FEATURE_TERRAFORM: boolean;
  readonly VITE_FEATURE_DESCRIBE_IT: boolean;
  readonly VITE_MAP_TILES: (typeof MAP_TILES_VALUES)[number];
}

export const BROWSER_ENV_KEYS: readonly (keyof BrowserConfig)[] = [
  'VITE_API_URL',
  'VITE_POLL_INTERVAL_MS',
  'VITE_EDITOR_TEST_HOOK',
  'VITE_FEATURE_TERRAFORM',
  'VITE_FEATURE_DESCRIBE_IT',
  'VITE_MAP_TILES',
];

class BrowserConfigError extends Error {
  constructor(key: keyof BrowserConfig, expected: string) {
    super(`Invalid configuration: ${key}: ${expected}`);
    this.name = 'BrowserConfigError';
  }
}

/** Treats `KEY=` lines as unset so the defaults apply. */
function read(source: EnvSource, key: keyof BrowserConfig, fallback: string): string {
  const value = source[key];
  return value === undefined || value === '' ? fallback : value;
}

function oneOf<const T extends string>(
  source: EnvSource,
  key: keyof BrowserConfig,
  choices: readonly T[],
  fallback: T,
): T {
  const value = read(source, key, fallback);
  const match = choices.find((choice) => choice === value);
  if (match === undefined) {
    throw new BrowserConfigError(key, `Expected one of ${choices.join(', ')}`);
  }
  return match;
}

function url(source: EnvSource, key: keyof BrowserConfig, fallback: string): string {
  const value = read(source, key, fallback);
  try {
    new URL(value);
  } catch {
    throw new BrowserConfigError(key, 'Expected a URL');
  }
  return value;
}

function positiveWholeNumber(source: EnvSource, key: keyof BrowserConfig, fallback: number) {
  const value = Number(read(source, key, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) {
    throw new BrowserConfigError(key, 'Expected a positive whole number');
  }
  return value;
}

function flag(source: EnvSource, key: keyof BrowserConfig): boolean {
  return oneOf(source, key, FLAG_VALUES, DEFAULT_FLAG) === 'true';
}

/** Parses the browser subset from an injected map. Vite exposes only VITE_ keys to the browser. */
export function loadBrowserConfig(source: EnvSource): BrowserConfig {
  return {
    VITE_API_URL: url(source, 'VITE_API_URL', DEFAULT_API_URL),
    VITE_POLL_INTERVAL_MS: positiveWholeNumber(
      source,
      'VITE_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
    ),
    VITE_EDITOR_TEST_HOOK: oneOf(
      source,
      'VITE_EDITOR_TEST_HOOK',
      EDITOR_TEST_HOOK_VALUES,
      DEFAULT_EDITOR_TEST_HOOK,
    ),
    VITE_FEATURE_TERRAFORM: flag(source, 'VITE_FEATURE_TERRAFORM'),
    VITE_FEATURE_DESCRIBE_IT: flag(source, 'VITE_FEATURE_DESCRIBE_IT'),
    VITE_MAP_TILES: oneOf(source, 'VITE_MAP_TILES', MAP_TILES_VALUES, DEFAULT_MAP_TILES),
  };
}

/** The web entry calls this under Vite, which always defines import.meta.env. */
export function loadBrowserConfigFromVite(): BrowserConfig {
  // Written as one import.meta.env expression so Vite can replace it at build time.
  return loadBrowserConfig((import.meta as unknown as { readonly env: EnvSource }).env);
}
