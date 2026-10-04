import { describe, expect, it } from 'vitest';

import { BROWSER_ENV_KEYS, loadBrowserConfig, loadBrowserConfigFromVite } from './browser.js';

import { browserEnvSchema } from './index.js';

describe('loadBrowserConfig', () => {
  it('keeps only the VITE_ keys the browser may see', () => {
    const config = loadBrowserConfig({
      VITE_API_URL: 'https://api.example.test',
      DATABASE_URL: 'postgres://secret',
      AI_API_KEY: 'secret',
    });
    expect(config).toEqual({
      VITE_API_URL: 'https://api.example.test',
      VITE_POLL_INTERVAL_MS: 5000,
      VITE_EDITOR_TEST_HOOK: 'off',
      VITE_FEATURE_TERRAFORM: true,
      VITE_FEATURE_DESCRIBE_IT: true,
      VITE_MAP_TILES: 'osm-raster',
    });
    expect(BROWSER_ENV_KEYS.every((key) => key.startsWith('VITE_'))).toBe(true);
  });

  it('reads the terraform flag the browser gates its tools on', () => {
    expect(loadBrowserConfig({ VITE_FEATURE_TERRAFORM: 'false' }).VITE_FEATURE_TERRAFORM).toBe(
      false,
    );
    expect(loadBrowserConfig({}).VITE_FEATURE_TERRAFORM).toBe(true);
  });

  it('reads the Describe it flag the browser hides the option on', () => {
    expect(loadBrowserConfig({ VITE_FEATURE_DESCRIBE_IT: 'false' }).VITE_FEATURE_DESCRIBE_IT).toBe(
      false,
    );
    expect(loadBrowserConfig({}).VITE_FEATURE_DESCRIBE_IT).toBe(true);
  });

  it('applies defaults and treats empty values as unset', () => {
    expect(loadBrowserConfig({ VITE_API_URL: '' }).VITE_API_URL).toBe('http://localhost:8787');
  });

  it('turns the editor test hook on only when asked', () => {
    expect(loadBrowserConfig({ VITE_EDITOR_TEST_HOOK: 'on' }).VITE_EDITOR_TEST_HOOK).toBe('on');
    expect(() => loadBrowserConfig({ VITE_EDITOR_TEST_HOOK: 'yes' })).toThrow(
      /VITE_EDITOR_TEST_HOOK/,
    );
  });
});

describe('loadBrowserConfig choices and bad values', () => {
  it('picks the static map tiles only when asked', () => {
    expect(loadBrowserConfig({ VITE_MAP_TILES: 'static' }).VITE_MAP_TILES).toBe('static');
    expect(() => loadBrowserConfig({ VITE_MAP_TILES: 'google' })).toThrow(/VITE_MAP_TILES/);
  });

  it('rejects a bad API URL', () => {
    expect(() => loadBrowserConfig({ VITE_API_URL: 'not a url' })).toThrow(/Invalid configuration/);
  });

  it('rejects a poll interval that is not a positive whole number', () => {
    for (const value of ['0', '-5', '2.5', 'soon']) {
      expect(() => loadBrowserConfig({ VITE_POLL_INTERVAL_MS: value })).toThrow(
        /VITE_POLL_INTERVAL_MS/,
      );
    }
    expect(loadBrowserConfig({ VITE_POLL_INTERVAL_MS: '250' }).VITE_POLL_INTERVAL_MS).toBe(250);
  });
});

describe('loadBrowserConfig against the env schema', () => {
  const samples = [
    {},
    { VITE_API_URL: 'https://parkshape.example/api', VITE_POLL_INTERVAL_MS: '1500' },
    { VITE_EDITOR_TEST_HOOK: 'on', VITE_MAP_TILES: 'static' },
    { VITE_FEATURE_TERRAFORM: 'false', VITE_FEATURE_DESCRIBE_IT: 'false' },
  ];

  it('lists the same keys as the browser subset of the env schema', () => {
    expect([...BROWSER_ENV_KEYS].sort()).toEqual(Object.keys(browserEnvSchema.shape).sort());
  });

  it.each(samples)('parses %o the same way the env schema does', (sample) => {
    expect(loadBrowserConfig(sample)).toEqual(browserEnvSchema.parse(sample));
  });
});

describe('loadBrowserConfigFromVite', () => {
  it('parses the env Vite defines; the e2e build checks the replaced value', () => {
    expect(loadBrowserConfigFromVite()).toEqual(loadBrowserConfig({}));
  });
});
