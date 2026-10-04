import { describe, expect, it } from 'vitest';

import { createInMemoryDeps } from '@parkshape/api';
import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';

import { withFixedRules } from './seed-config.js';

const GEMINI_SETUP = { AI_API_KEY: 'owner-key', PARKSHAPE_OFFLINE: '0' };

describe('withFixedRules', () => {
  it('turns the AI provider to the fixed rules and keeps every other value', () => {
    const config = loadConfig(GEMINI_SETUP);
    expect(config.AI_PROVIDER).toBe('openai-compatible');
    expect(withFixedRules(config)).toEqual({ ...config, AI_PROVIDER: 'rule-based' });
  });

  it('never calls the model, even with a key set and the network open', async () => {
    const calls: string[] = [];
    const deps = createInMemoryDeps(withFixedRules(loadConfig(GEMINI_SETUP)), {
      clock: new FakeClock(new Date(0)),
      fetch: (url) => {
        calls.push(url);
        return Promise.reject(new Error('the seed must not reach a model'));
      },
    });
    expect((await deps.ai.intent.parse('a dog park in the back corner')).source).toBe('rule-based');
    expect(calls).toEqual([]);
  });
});
