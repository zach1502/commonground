const GLOBSTAR_LENGTH = 2;
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/;

function translateBraces(pattern: string, start: number): { source: string; end: number } {
  const close = pattern.indexOf('}', start);
  if (close === -1) {
    return { source: '\\{', end: start };
  }
  const options = pattern
    .slice(start + 1, close)
    .split(',')
    .map((option) => globSource(option));
  return { source: `(?:${options.join('|')})`, end: close };
}

function translateStar(pattern: string, index: number): { source: string; end: number } {
  if (pattern[index + 1] !== '*') {
    return { source: '[^/]*', end: index };
  }
  const afterGlobstar = index + GLOBSTAR_LENGTH;
  if (pattern[afterGlobstar] === '/') {
    return { source: '(?:.*/)?', end: afterGlobstar };
  }
  return { source: '.*', end: index + 1 };
}

function translateChar(pattern: string, index: number): { source: string; end: number } {
  const char = pattern.charAt(index);
  if (char === '*') {
    return translateStar(pattern, index);
  }
  if (char === '?') {
    return { source: '[^/]', end: index };
  }
  if (char === '{') {
    return translateBraces(pattern, index);
  }
  return { source: REGEX_SPECIAL.test(char) ? `\\${char}` : char, end: index };
}

function globSource(pattern: string): string {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const step = translateChar(pattern, index);
    source += step.source;
    index = step.end;
  }
  return source;
}

const cache = new Map<string, RegExp>();

/** Compiles a glob with `**`, `*`, `?` and `{a,b}` into an anchored regular expression. */
export function globToRegExp(pattern: string): RegExp {
  let compiled = cache.get(pattern);
  if (compiled === undefined) {
    compiled = new RegExp(`^${globSource(pattern)}$`);
    cache.set(pattern, compiled);
  }
  return compiled;
}

/** True when the repo-relative path matches any of the globs. */
export function matchesAny(file: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(file));
}
