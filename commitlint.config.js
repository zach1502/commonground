import { checkText } from './tools/textlint-rules/content-checker.js';

const HEADER_MAX_LENGTH = 72;

/** Runs the content rules (tools/preflight/content-rules.json) on the header and body. */
function contentRules(parsed) {
  const text = [parsed.header, parsed.body].filter(Boolean).join('\n\n');
  const errors = checkText(text, { scope: 'all' }).filter(({ severity }) => severity === 'error');
  if (errors.length === 0) {
    return [true];
  }
  const found = errors.map(
    ({ id, index, length }) => `${id}: "${text.slice(index, index + length)}"`,
  );
  return [false, `commit message breaks content rules: ${found.join(', ')}`];
}

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'parkshape/content-rules': contentRules } }],
  rules: {
    'header-max-length': [2, 'always', HEADER_MAX_LENGTH],
    'parkshape/content-rules': [2, 'always'],
  },
};
