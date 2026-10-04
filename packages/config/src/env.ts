import { isAbsolute } from 'node:path';

import { z } from 'zod';

import type { EnvSource } from './browser.js';
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_FALLBACK_MODEL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER,
  DEFAULT_API_URL,
  DEFAULT_EDITOR_TEST_HOOK,
  DEFAULT_FLAG,
  DEFAULT_MAP_TILES,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PORT,
  COOKIE_SECURE_VALUES,
  DEFAULT_RATE_LIMIT_COMMENTS_PER_MINUTE,
  DEFAULT_RATE_LIMIT_DRAFT_SAVES_PER_MINUTE,
  DEFAULT_RATE_LIMIT_INTENTS_PER_MINUTE,
  DEFAULT_RATE_LIMIT_LOGINS_PER_MINUTE,
  DEFAULT_RATE_LIMIT_SUBMISSIONS_PER_HOUR,
  DEFAULT_RATE_LIMIT_THUMBNAILS_PER_HOUR,
  DEFAULT_RATE_LIMIT_VOTES_PER_MINUTE,
  EDITOR_TEST_HOOK_VALUES,
  FLAG_VALUES,
  MAP_TILES_VALUES,
  MIN_AUTH_SECRET_LENGTH,
  MIN_STAFF_ACCESS_CODE_LENGTH,
} from './defaults.js';

const MAX_PORT = 65_535;
const DATABASE_URL_PATTERN = /^(pglite|postgres|postgresql):\/\/.+/;
const PGLITE_PREFIX = 'pglite://';
const POSTGRES_SERVER_URL_PATTERN = /^(postgres|postgresql):\/\/.+/;

const booleanFlag = z
  .enum(FLAG_VALUES)
  .default(DEFAULT_FLAG)
  .transform((value) => value === 'true');

// Off unless set: without a trusted proxy in front, X-Forwarded-For is whatever the caller wrote.
const offFlag = z
  .enum(FLAG_VALUES)
  .default('false')
  .transform((value) => value === 'true');

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const optionalUrl = z.union([z.literal(''), z.url()]).default('');

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  TERRAIN_PROVIDER: z.enum(['static', 'hrdem', 'chain']).default('static'),
  SITE_FEATURES_PROVIDER: z.enum(['static', 'vancouver']).default('static'),
  SITE_CONTEXT_PROVIDER: z.enum(['static', 'vancouver']).default('static'),
  DATABASE_URL: z.string().regex(DATABASE_URL_PATTERN).default('pglite://.data/parkshape'),
  BLOB_STORE: z.enum(['memory', 'local-fs', 'supabase']).default('memory'),
  BLOB_DIR: z.string().default(''),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_KEY: z.string().default(''),
  SUPABASE_BUCKET: z.string().min(1).default('parkshape'),
  AUTH_PROVIDER: z.enum(['mock']).default('mock'),
  AUTH_SECRET: z.union([z.literal(''), z.string().min(MIN_AUTH_SECRET_LENGTH)]).default(''),
  AUTH_COOKIE_SECURE: z.enum(COOKIE_SECURE_VALUES).default('auto'),
  STAFF_ACCESS_CODE: z
    .union([z.literal(''), z.string().min(MIN_STAFF_ACCESS_CODE_LENGTH)])
    .default(''),
  AI_PROVIDER: z.enum(['rule-based', 'fake', 'openai-compatible']).default(DEFAULT_AI_PROVIDER),
  // '' stays valid for configs built in code; from the environment an empty value takes the default.
  AI_BASE_URL: z.union([z.literal(''), z.url()]).default(DEFAULT_AI_BASE_URL),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().min(1).default(DEFAULT_AI_MODEL),
  // '' in a config built in code means no fallback model. From the environment a blank value
  // takes the default, as for every other key; set it to AI_MODEL to turn the fallback off.
  AI_FALLBACK_MODEL: z.string().default(DEFAULT_AI_FALLBACK_MODEL),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  VITE_API_URL: z.url().default(DEFAULT_API_URL),
  VITE_POLL_INTERVAL_MS: positiveInt(DEFAULT_POLL_INTERVAL_MS),
  VITE_EDITOR_TEST_HOOK: z.enum(EDITOR_TEST_HOOK_VALUES).default(DEFAULT_EDITOR_TEST_HOOK),
  VITE_MAP_TILES: z.enum(MAP_TILES_VALUES).default(DEFAULT_MAP_TILES),
  FEATURE_DESCRIBE_IT: booleanFlag,
  FEATURE_SUMMARY: booleanFlag,
  FEATURE_TERRAFORM: booleanFlag,
  VITE_FEATURE_TERRAFORM: booleanFlag,
  VITE_FEATURE_DESCRIBE_IT: booleanFlag,
  RATE_LIMIT_VOTES_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_VOTES_PER_MINUTE),
  RATE_LIMIT_SUBMISSIONS_PER_HOUR: positiveInt(DEFAULT_RATE_LIMIT_SUBMISSIONS_PER_HOUR),
  RATE_LIMIT_LOGINS_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_LOGINS_PER_MINUTE),
  RATE_LIMIT_INTENTS_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_INTENTS_PER_MINUTE),
  RATE_LIMIT_DRAFT_SAVES_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_DRAFT_SAVES_PER_MINUTE),
  RATE_LIMIT_THUMBNAILS_PER_HOUR: positiveInt(DEFAULT_RATE_LIMIT_THUMBNAILS_PER_HOUR),
  RATE_LIMIT_COMMENTS_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_COMMENTS_PER_MINUTE),
  RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('memory'),
  TRUST_PROXY: offFlag,
  PARKSHAPE_LIVE: z.enum(['0', '1']).default('0'),
  PARKSHAPE_OFFLINE: z.enum(['0', '1']).default('0'),
  PARKSHAPE_TEST_DATABASE_URL: z
    .union([z.literal(''), z.string().regex(POSTGRES_SERVER_URL_PATTERN)])
    .default(''),
});

type EnvConfig = z.output<typeof envSchema>;

/** The Supabase blob store cannot start without its project URL and service key. */
function supabaseIssues(config: EnvConfig): readonly (keyof EnvConfig)[] {
  if (config.BLOB_STORE !== 'supabase') {
    return [];
  }
  return (['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const).filter((key) => config[key] === '');
}

/**
 * The local-fs blob store needs one fixed directory, so the seed and the dev API, which start
 * in different working directories, read and write the same files.
 */
function blobDirIssue(config: EnvConfig): string | undefined {
  if (config.BLOB_STORE !== 'local-fs') {
    return undefined;
  }
  if (config.BLOB_DIR === '') {
    return 'BLOB_DIR is required for local-fs';
  }
  return isAbsolute(config.BLOB_DIR) ? undefined : 'BLOB_DIR must be an absolute path for local-fs';
}

/**
 * A hosted API runs on many instances, so every instance must sign sessions with one shared
 * secret. Only a local pglite run may fall back to a generated secret.
 */
function authSecretIssues(config: EnvConfig): readonly (keyof EnvConfig)[] {
  const local = config.DATABASE_URL.startsWith(PGLITE_PREFIX);
  return !local && config.AUTH_SECRET === '' ? ['AUTH_SECRET'] : [];
}

// Browsers treat these hosts as secure contexts over plain http, which is how local dev runs.
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True when the web origin is a local dev host; the cookie Secure flag and staff login use it. */
export function isLocalOrigin(origin: string): boolean {
  return LOCAL_HOSTS.has(new URL(origin).hostname);
}

export type StaffLoginMode = 'open' | 'code';

/** Anyone can pick the staff persona on a local run; anywhere else staff need the access code. */
function staffLoginMode(config: EnvConfig): StaffLoginMode {
  return isLocalOrigin(config.CORS_ORIGIN) && config.STAFF_ACCESS_CODE === '' ? 'open' : 'code';
}

const appConfigSchema = envSchema
  .superRefine((config, ctx) => {
    for (const key of supabaseIssues(config)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required for supabase` });
    }
    const blobDir = blobDirIssue(config);
    if (blobDir !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['BLOB_DIR'], message: blobDir });
    }
    for (const key of authSecretIssues(config)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required unless pglite` });
    }
    if (staffLoginMode(config) === 'code' && config.STAFF_ACCESS_CODE === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['STAFF_ACCESS_CODE'],
        message: 'STAFF_ACCESS_CODE is required when CORS_ORIGIN is not localhost or 127.0.0.1',
      });
    }
  })
  .transform((config) => ({ ...config, staffLoginMode: staffLoginMode(config) }));

export type AppConfig = z.output<typeof appConfigSchema>;

/** Treats `KEY=` lines as unset so schema defaults apply. */
function dropEmpty(source: EnvSource): EnvSource {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

function parseEnv<S extends z.ZodType>(schema: S, source: EnvSource): z.output<S> {
  const result = schema.safeParse(dropEmpty(source));
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Parses an injected environment map. Pure: never reads process.env itself. */
export function loadConfig(source: EnvSource): AppConfig {
  return parseEnv(appConfigSchema, source);
}

/** The subset the web bundle may read; browser.ts parses the same keys without zod. */
export const browserEnvSchema = envSchema.pick({
  VITE_API_URL: true,
  VITE_POLL_INTERVAL_MS: true,
  VITE_EDITOR_TEST_HOOK: true,
  VITE_FEATURE_TERRAFORM: true,
  VITE_FEATURE_DESCRIBE_IT: true,
  VITE_MAP_TILES: true,
});

/** Entry points call this at startup; it is the only process.env reader outside tools. */
export function loadConfigFromProcess(): AppConfig {
  return loadConfig(process.env);
}
