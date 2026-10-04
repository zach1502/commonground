import { describe, expect, it } from 'vitest';

import { compareEnv } from '../env-keys.js';
import { fixtureContext, problems } from '../testing/fixture-context.js';

import { envFindings, rule } from './env-documented.js';

describe('env-documented', () => {
  it('passes when the schema and .env.example match and every key has a comment', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails drift in both directions and an uncommented key', async () => {
    const messages = (await problems(rule, fixtureContext(rule.id, 'fail'))).map(
      ({ message }) => message,
    );
    expect(messages).toEqual([
      'AUTH_PROVIDER is in the env schema but not in .env.example',
      'AI_PROVIDER is in .env.example but not in the env schema',
      'AI_PROVIDER has no comment line above it',
    ]);
  });

  it('reports missing files instead of throwing', () => {
    expect(envFindings('/nonexistent-preflight-root', 'doctor:env')).toHaveLength(2);
  });

  it('reads only top-level schema keys', () => {
    const schema =
      'export const envSchema = z.object({\n  A: z.object({\n    NESTED: z.string(),\n  }),\n  B: x,\n});\n';
    expect(compareEnv(schema, '# a\nA=1\n# b\nB=2\n').missingFromSchema).toEqual([]);
  });
});
