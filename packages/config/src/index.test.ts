import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { envSchema, loadConfig, loadConfigFromProcess } from './index.js';

const CUSTOM_PORT = 9000;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ENV_EXAMPLE = new URL('../../../.env.example', import.meta.url);

function parseEnvExample(): Record<string, string> {
  const lines = readFileSync(ENV_EXAMPLE, 'utf8').split('\n');
  const pairs = lines
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => line.split('='))
    .map(([key = '', ...rest]) => [key, rest.join('=')] as const);
  return Object.fromEntries(pairs);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadConfig', () => {
  it('applies defaults to an empty source', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(8787);
    expect(config.DATABASE_URL).toBe('pglite://.data/parkshape');
    expect(config.FEATURE_TERRAFORM).toBe(true);
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('coerces strings and treats empty values as unset', () => {
    const config = loadConfig({
      PORT: String(CUSTOM_PORT),
      FEATURE_SUMMARY: 'false',
      VITE_POLL_INTERVAL_MS: '',
    });
    expect(config.PORT).toBe(CUSTOM_PORT);
    expect(config.FEATURE_SUMMARY).toBe(false);
    expect(config.VITE_POLL_INTERVAL_MS).toBe(5000);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://nope' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ FEATURE_SUMMARY: 'yes' })).toThrow(/Invalid configuration/);
  });

  it('accepts the live terrain and site feature adapters', () => {
    const config = loadConfig({ TERRAIN_PROVIDER: 'chain', SITE_FEATURES_PROVIDER: 'vancouver' });
    expect(config.TERRAIN_PROVIDER).toBe('chain');
    expect(config.SITE_FEATURES_PROVIDER).toBe('vancouver');
    expect(loadConfig({ TERRAIN_PROVIDER: 'hrdem' }).TERRAIN_PROVIDER).toBe('hrdem');
    expect(() => loadConfig({ TERRAIN_PROVIDER: 'dsm' })).toThrow(/TERRAIN_PROVIDER/);
  });

  it('accepts the fake and OpenAI-compatible model adapters with a model name', () => {
    const config = loadConfig({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'local-model' });
    expect(config.AI_PROVIDER).toBe('openai-compatible');
    expect(config.AI_MODEL).toBe('local-model');
    expect(loadConfig({ AI_PROVIDER: 'fake' }).AI_PROVIDER).toBe('fake');
    expect(() => loadConfig({ AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER/);
  });

  it('keeps @live tests off unless PARKSHAPE_LIVE is 1', () => {
    expect(loadConfig({}).PARKSHAPE_LIVE).toBe('0');
    expect(loadConfig({ PARKSHAPE_LIVE: '1' }).PARKSHAPE_LIVE).toBe('1');
    expect(() => loadConfig({ PARKSHAPE_LIVE: 'yes' })).toThrow(/PARKSHAPE_LIVE/);
  });

  it('matches .env.example key for key, with equal defaults', () => {
    const example = parseEnvExample();
    expect(Object.keys(example).sort()).toEqual(Object.keys(envSchema.shape).sort());
    expect(loadConfig(example)).toEqual(loadConfig({}));
  });

  it('reads the process environment on demand', () => {
    vi.stubEnv('PORT', String(CUSTOM_PORT));
    expect(loadConfigFromProcess().PORT).toBe(CUSTOM_PORT);
  });
});

describe('loadConfig for the AI model', () => {
  it('picks Gemini by default, with an empty key that leaves the answers to the fixed rules', () => {
    const config = loadConfig({});
    expect(config.AI_PROVIDER).toBe('openai-compatible');
    expect(config.AI_BASE_URL).toBe(GEMINI_URL);
    expect(config.AI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(config.AI_FALLBACK_MODEL).toBe('gemini-3.1-flash-lite');
    expect(config.AI_API_KEY).toBe('');
  });

  it('keeps the fixed rules when AI_PROVIDER is rule-based', () => {
    expect(loadConfig({ AI_PROVIDER: 'rule-based' }).AI_PROVIDER).toBe('rule-based');
  });

  it('switches to Gemini with only AI_API_KEY set', () => {
    const config = loadConfig({ AI_API_KEY: 'test-key' });
    expect(config).toMatchObject({
      AI_PROVIDER: 'openai-compatible',
      AI_BASE_URL: GEMINI_URL,
      AI_MODEL: 'gemini-3.5-flash-lite',
      AI_FALLBACK_MODEL: 'gemini-3.1-flash-lite',
    });
  });

  it('never ends up with an empty model name', () => {
    // From the environment an empty value takes the default; a config built in code is refused.
    expect(loadConfig({ AI_MODEL: '' }).AI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(envSchema.safeParse({ AI_MODEL: '' }).success).toBe(false);
  });

  it('takes the default fallback model for a blank env value, like every other key', () => {
    expect(loadConfig({ AI_FALLBACK_MODEL: '' }).AI_FALLBACK_MODEL).toBe('gemini-3.1-flash-lite');
    expect(loadConfig({ AI_FALLBACK_MODEL: 'local-small' }).AI_FALLBACK_MODEL).toBe('local-small');
  });

  it('lets a config built in code turn the fallback model off with an empty value', () => {
    const parsed = envSchema.parse({ AI_FALLBACK_MODEL: '' });
    expect(parsed.AI_FALLBACK_MODEL).toBe('');
  });
});

describe('loadConfig for hosted and offline runs', () => {
  it('runs the database tests on pglite unless PARKSHAPE_TEST_DATABASE_URL names a server', () => {
    expect(loadConfig({}).PARKSHAPE_TEST_DATABASE_URL).toBe('');
    const url = 'postgres://localhost:55432/parkshape_ci';
    expect(loadConfig({ PARKSHAPE_TEST_DATABASE_URL: url }).PARKSHAPE_TEST_DATABASE_URL).toBe(url);
    expect(() => loadConfig({ PARKSHAPE_TEST_DATABASE_URL: 'pglite://memory' })).toThrow(
      /PARKSHAPE_TEST_DATABASE_URL/,
    );
  });

  it('accepts the Supabase blob store once its URL and service key are set', () => {
    const supabase = {
      BLOB_STORE: 'supabase',
      SUPABASE_URL: 'https://example-ref.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-key',
    };
    const config = loadConfig(supabase);
    expect(config.BLOB_STORE).toBe('supabase');
    expect(config.SUPABASE_BUCKET).toBe('parkshape');
    expect(() => loadConfig({ ...supabase, SUPABASE_URL: '' })).toThrow(/SUPABASE_URL/);
    expect(() => loadConfig({ ...supabase, SUPABASE_SERVICE_KEY: '' })).toThrow(
      /SUPABASE_SERVICE_KEY/,
    );
    expect(() => loadConfig({ BLOB_STORE: 's3' })).toThrow(/BLOB_STORE/);
  });

  it('accepts the local-fs blob store once BLOB_DIR is an absolute path', () => {
    const config = loadConfig({ BLOB_STORE: 'local-fs', BLOB_DIR: '/tmp/parkshape-blobs' });
    expect(config.BLOB_STORE).toBe('local-fs');
    expect(config.BLOB_DIR).toBe('/tmp/parkshape-blobs');
    expect(loadConfig({}).BLOB_STORE).toBe('memory');
    expect(() => loadConfig({ BLOB_STORE: 'local-fs' })).toThrow(
      /BLOB_DIR is required for local-fs/,
    );
    expect(() => loadConfig({ BLOB_STORE: 'local-fs', BLOB_DIR: '.data/blobs' })).toThrow(
      /BLOB_DIR must be an absolute path/,
    );
    expect(() => loadConfig({ BLOB_STORE: 'local' })).toThrow(/BLOB_STORE/);
  });

  it('keeps rate-limit buckets in memory unless RATE_LIMIT_STORE is postgres', () => {
    expect(loadConfig({}).RATE_LIMIT_STORE).toBe('memory');
    expect(loadConfig({ RATE_LIMIT_STORE: 'postgres' }).RATE_LIMIT_STORE).toBe('postgres');
    expect(() => loadConfig({ RATE_LIMIT_STORE: 'redis' })).toThrow(/RATE_LIMIT_STORE/);
  });

  it('allows outbound requests unless PARKSHAPE_OFFLINE is 1', () => {
    expect(loadConfig({}).PARKSHAPE_OFFLINE).toBe('0');
    expect(loadConfig({ PARKSHAPE_OFFLINE: '1' }).PARKSHAPE_OFFLINE).toBe('1');
    expect(() => loadConfig({ PARKSHAPE_OFFLINE: 'true' })).toThrow(/PARKSHAPE_OFFLINE/);
  });
});

describe('loadConfig for sessions', () => {
  const longSecret = 'a'.repeat(32);
  const postgresUrl = 'postgres://user:pass@db.example.com:6543/postgres';

  it('leaves AUTH_SECRET empty by default and accepts one of 32 characters or more', () => {
    expect(loadConfig({}).AUTH_SECRET).toBe('');
    expect(loadConfig({ AUTH_SECRET: longSecret }).AUTH_SECRET).toBe(longSecret);
    expect(() => loadConfig({ AUTH_SECRET: 'a'.repeat(31) })).toThrow(/AUTH_SECRET/);
  });

  it('requires AUTH_SECRET when the database is not pglite', () => {
    expect(() => loadConfig({ DATABASE_URL: postgresUrl })).toThrow(/AUTH_SECRET/);
    expect(loadConfig({ DATABASE_URL: postgresUrl, AUTH_SECRET: longSecret }).AUTH_SECRET).toBe(
      longSecret,
    );
  });

  it('decides the Secure cookie flag from the origin unless AUTH_COOKIE_SECURE says otherwise', () => {
    expect(loadConfig({}).AUTH_COOKIE_SECURE).toBe('auto');
    expect(loadConfig({ AUTH_COOKIE_SECURE: 'on' }).AUTH_COOKIE_SECURE).toBe('on');
    expect(loadConfig({ AUTH_COOKIE_SECURE: 'off' }).AUTH_COOKIE_SECURE).toBe('off');
    expect(() => loadConfig({ AUTH_COOKIE_SECURE: 'true' })).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('has rate limits for sign-ins, intents, draft saves and thumbnails', () => {
    const config = loadConfig({ RATE_LIMIT_LOGINS_PER_MINUTE: '3' });
    expect(config.RATE_LIMIT_LOGINS_PER_MINUTE).toBe(3);
    expect(config.RATE_LIMIT_INTENTS_PER_MINUTE).toBeGreaterThan(0);
    expect(config.RATE_LIMIT_DRAFT_SAVES_PER_MINUTE).toBeGreaterThan(0);
    expect(config.RATE_LIMIT_THUMBNAILS_PER_HOUR).toBeGreaterThan(0);
  });

  it('allows 10 element comments a minute unless RATE_LIMIT_COMMENTS_PER_MINUTE says otherwise', () => {
    expect(loadConfig({}).RATE_LIMIT_COMMENTS_PER_MINUTE).toBe(10);
    expect(loadConfig({ RATE_LIMIT_COMMENTS_PER_MINUTE: '4' }).RATE_LIMIT_COMMENTS_PER_MINUTE).toBe(
      4,
    );
    expect(() => loadConfig({ RATE_LIMIT_COMMENTS_PER_MINUTE: '0' })).toThrow(
      /RATE_LIMIT_COMMENTS_PER_MINUTE/,
    );
  });
});

describe('SITE_CONTEXT_PROVIDER', () => {
  it('picks the static site context by default and accepts vancouver', () => {
    expect(loadConfig({}).SITE_CONTEXT_PROVIDER).toBe('static');
    expect(loadConfig({ SITE_CONTEXT_PROVIDER: 'vancouver' }).SITE_CONTEXT_PROVIDER).toBe(
      'vancouver',
    );
    expect(() => loadConfig({ SITE_CONTEXT_PROVIDER: 'osm' })).toThrow(/SITE_CONTEXT_PROVIDER/);
  });
});
