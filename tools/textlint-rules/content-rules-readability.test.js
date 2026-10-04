import path from 'node:path';

import { createLinter, loadTextlintrc } from 'textlint';
import { describe, expect, it } from 'vitest';

const TEXTLINTRC = new URL('../../.textlintrc.json', import.meta.url).pathname;
const ERROR = 2;
const HARD =
  'Comprehensive accessibility considerations necessitate organizational responsibility. Documentation communicates institutional expectations.';

/** Lints a plain paragraph and a hard one under `file`, through the repo's .textlintrc.json. */
async function lint(...segments) {
  const descriptor = await loadTextlintrc({ configFilePath: TEXTLINTRC });
  const file = path.join(process.cwd(), ...segments);
  const result = await createLinter({ descriptor }).lintText(`Plain words.\n\n${HARD}\n`, file);
  return result.messages
    .filter(({ message }) => message.endsWith('(readability)'))
    .map(({ severity, line, message }) => ({ severity, line, message }));
}

describe('readability textlint rule', () => {
  it('reports a hard paragraph in a developer doc as an error', async () => {
    const [message, ...rest] = await lint('docs', 'probe.md');
    expect(rest).toEqual([]);
    expect(message).toMatchObject({ line: 3, severity: ERROR });
    expect(message?.message).toContain('the limit is 10.0');
  });

  it('checks the root docs', async () => {
    expect(await lint('README.md')).toHaveLength(1);
  });

  it('skips Markdown outside the developer docs', async () => {
    expect(await lint('packages', 'ui', 'README.md')).toEqual([]);
  });
});
