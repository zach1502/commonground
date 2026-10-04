import { describe, expect, it } from 'vitest';

import { cutOut, PROMPT_PLACEHOLDER, withoutPrompt } from './redact.js';

const RESIDENT_TEXT = 'Plant "tall" cedars\nby the bench';

describe('cutOut', () => {
  it('replaces every copy of the text, as written and as escaped in a JSON string', () => {
    const reply = `${RESIDENT_TEXT} | ${JSON.stringify({ input: RESIDENT_TEXT })}`;
    expect(cutOut(reply, RESIDENT_TEXT, '[x]')).toBe('[x] | {"input":"[x]"}');
  });

  it('leaves the text alone when there is nothing to cut', () => {
    expect(cutOut('bad request', '', '[x]')).toBe('bad request');
  });
});

describe('withoutPrompt', () => {
  it('cuts the system prompt and the user text out', () => {
    const request = { system: 'Answer in JSON.', user: RESIDENT_TEXT };
    const reply = `system: Answer in JSON. user: ${RESIDENT_TEXT}`;
    expect(withoutPrompt(reply, request)).toBe(
      `system: ${PROMPT_PLACEHOLDER} user: ${PROMPT_PLACEHOLDER}`,
    );
  });
});
