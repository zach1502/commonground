import { readFileSync } from 'node:fs';

import { createLinter, loadTextlintrc } from 'textlint';
import { describe, expect, it } from 'vitest';

const TEXTLINTRC = new URL('../../.textlintrc.json', import.meta.url).pathname;
const ERROR = 2;
const WARNING = 1;
// Words come from the rules file so this test file stays free of them.
const RULES = JSON.parse(
  readFileSync(new URL('../preflight/content-rules.json', import.meta.url), 'utf8'),
);
const [BANNED_WORD] = RULES.banned;
const [REVIEW] = RULES.reviewOnly;

async function lintMarkdown(text) {
  const descriptor = await loadTextlintrc({ configFilePath: TEXTLINTRC });
  const result = await createLinter({ descriptor }).lintText(text, 'probe.md');
  return result.messages.map(({ message, severity, line, column }) => ({
    message,
    severity,
    line,
    column,
  }));
}

describe('@parkshape/content textlint rule', () => {
  it('reports banned words at their position as errors', async () => {
    const [message] = await lintMarkdown(`Parks that ${BANNED_WORD} play.\n`);
    expect(message).toMatchObject({ severity: ERROR, line: 1, column: 12 });
    expect(message?.message).toContain('(banned-word)');
  });

  it('reports review words as warnings', async () => {
    const [message] = await lintMarkdown(`Store the ${REVIEW.word} here.\n`);
    expect(message).toMatchObject({ severity: WARNING });
  });

  it('runs markdown line checks and skips inline code', async () => {
    const messages = await lintMarkdown(
      `# Install The Dependencies\n\nRun \`${BANNED_WORD}\` now.\n`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('(title-case-heading)');
  });
});
