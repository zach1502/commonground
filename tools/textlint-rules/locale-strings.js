import { checkText } from './content-checker.js';
import { localeReadabilityFindings } from './readability.js';

const LOCALES_SEGMENT = 'apps/web/src/locales/';

/** Yields [jsonPointer, value] for every string value in a parsed JSON document. */
export function* stringsIn(value, pointer = '') {
  if (typeof value === 'string') {
    yield [pointer === '' ? '/' : pointer, value];
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* stringsIn(child, `${pointer}/${key}`);
    }
  }
}

/** Locale files get the UI-only checks; other JSON (seed data) gets the shared checks. */
export function scopeForFile(file) {
  return file.replaceAll('\\', '/').includes(LOCALES_SEGMENT) ? 'locales' : 'all';
}

const toPosix = (file) => file.replaceAll('\\', '/');

/**
 * The JSON files among command-line arguments. `pnpm lint:content docs/X.md` passes the Markdown
 * path to both textlint and this linter; textlint checks it, so this linter skips it.
 */
export function jsonFileArgs(args) {
  return args.filter((arg) => !arg.startsWith('--') && arg.endsWith('.json'));
}

/**
 * The app locale files among `files`, matched from the repo root. Preflight fixtures that
 * copy the locales path, such as tools/preflight/fixtures/.../apps/web/src/locales, are left out.
 */
export function localeFilesIn(files, rootDir) {
  const prefix = `${toPosix(rootDir).replace(/\/$/, '')}/${LOCALES_SEGMENT}`;
  return files.filter((file) => toPosix(file).startsWith(prefix));
}

/**
 * Checks each string value in a JSON document.
 * @returns {{ file: string, pointer: string, finding: import('./content-checker.js').Finding }[]}
 */
export function lintJsonText(text, file, scope = scopeForFile(file)) {
  return [...stringsIn(JSON.parse(text))].flatMap(([pointer, value]) =>
    checkText(value, { scope }).map((finding) => ({ file, pointer, finding })),
  );
}

/** Multi-sentence locale strings above grade 8 (CONTENT.md#who-we-write-for). Seed JSON is skipped. */
export function lintLocaleReadability(text, file) {
  if (scopeForFile(file) !== 'locales') {
    return [];
  }
  return [...stringsIn(JSON.parse(text))].flatMap(([pointer, value]) =>
    localeReadabilityFindings(value).map((finding) => ({ file, pointer, finding })),
  );
}

/** One line per problem, in the same shape as other lint output. */
export function formatProblem({ file, pointer, finding }) {
  return `${file} ${pointer} ${finding.severity} ${finding.message} (${finding.id})`;
}
