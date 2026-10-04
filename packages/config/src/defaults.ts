// Defaults mirror .env.example so an empty environment boots the fully local stack. The server
// schema and the browser parser both read them, so the two cannot drift.
export const DEFAULT_PORT = 8787;
export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_RATE_LIMIT_VOTES_PER_MINUTE = 30;
export const DEFAULT_RATE_LIMIT_SUBMISSIONS_PER_HOUR = 10;
export const DEFAULT_RATE_LIMIT_LOGINS_PER_MINUTE = 20;
export const DEFAULT_RATE_LIMIT_INTENTS_PER_MINUTE = 10;
// Autosave waits 500 ms after the last edit, so steady editing sends at most 2 saves a second.
export const DEFAULT_RATE_LIMIT_DRAFT_SAVES_PER_MINUTE = 120;
export const DEFAULT_RATE_LIMIT_THUMBNAILS_PER_HOUR = 30;
export const DEFAULT_RATE_LIMIT_COMMENTS_PER_MINUTE = 10;
export const MIN_AUTH_SECRET_LENGTH = 32;
export const MIN_STAFF_ACCESS_CODE_LENGTH = 8;
export const DEFAULT_API_URL = 'http://localhost:8787';
// Gemini is the default model. With AI_API_KEY empty the API still uses the fixed rules, so an
// empty environment stays offline.
export const DEFAULT_AI_PROVIDER = 'openai-compatible';
// Gemini's OpenAI-compatible endpoint. The client adds /chat/completions, so no trailing slash.
// Nothing calls it until AI_API_KEY is set.
export const DEFAULT_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const DEFAULT_AI_MODEL = 'gemini-3.5-flash-lite';
// Asked when AI_MODEL answers 429. Gemini counts free-tier limits per model, so it has its own quota.
export const DEFAULT_AI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export const EDITOR_TEST_HOOK_VALUES = ['on', 'off'] as const;
export const MAP_TILES_VALUES = ['osm-raster', 'static'] as const;
export const FLAG_VALUES = ['true', 'false'] as const;
export const COOKIE_SECURE_VALUES = ['auto', 'on', 'off'] as const;

export const DEFAULT_EDITOR_TEST_HOOK = 'off';
export const DEFAULT_MAP_TILES = 'osm-raster';
export const DEFAULT_FLAG = 'true';
