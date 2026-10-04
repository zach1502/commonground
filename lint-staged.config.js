import { localeFilesIn } from './tools/textlint-rules/locale-strings.js';

const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');

/** JSON gets Prettier; locale files also get the content rules via lint-locales.js. */
function jsonTasks(files) {
  const locales = localeFilesIn(files, process.cwd());
  const tasks = [`prettier --write ${quote(files)}`];
  if (locales.length > 0) {
    tasks.push(`node tools/textlint-rules/lint-locales.js ${quote(locales)}`);
  }
  return tasks;
}

export default {
  '*.{ts,tsx,js,cjs,mjs}': ['eslint --fix --max-warnings 0 --no-warn-ignored', 'prettier --write'],
  '*.css': ['stylelint --fix --allow-empty-input', 'prettier --write'],
  '*.md': ['prettier --write', 'textlint'],
  '*.json': jsonTasks,
  '*.{yml,yaml}': ['prettier --write'],
};
