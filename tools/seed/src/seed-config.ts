import type { AppConfig } from '@parkshape/config';

/**
 * The config `pnpm seed` and the e2e API run on: the given config with AI_PROVIDER set to the
 * fixed rules, whatever the environment or .env says. Seeded content must be the same on every
 * run, and the browser tests must not depend on Gemini or spend the owner's quota.
 */
export function withFixedRules(config: AppConfig): AppConfig {
  return { ...config, AI_PROVIDER: 'rule-based' };
}
