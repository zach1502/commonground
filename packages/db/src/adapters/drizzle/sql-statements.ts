/**
 * Splits a SQL file into statements for a driver that runs one statement per call. Drizzle's
 * `execute` sends each call through the extended protocol on both pglite and postgres-js, and
 * that protocol refuses a batch, so the file cannot go to the server whole. A semicolon ends a
 * statement only outside strings, quoted names, dollar-quoted bodies and comments, which follows
 * the Postgres lexer closely enough for hand-written migration files.
 */
export function sqlStatements(text: string): string[] {
  const statements: string[] = [];
  let current = '';
  let at = 0;
  while (at < text.length) {
    const commentEnd = endOfComment(text, at);
    const literalEnd = commentEnd === undefined ? endOfLiteral(text, at) : undefined;
    if (commentEnd !== undefined) {
      current += ' ';
      at = commentEnd;
    } else if (literalEnd !== undefined) {
      current += text.slice(at, literalEnd);
      at = literalEnd;
    } else if (text[at] === ';') {
      statements.push(current);
      current = '';
      at += 1;
    } else {
      current += text[at] ?? '';
      at += 1;
    }
  }
  statements.push(current);
  return statements.map((statement) => statement.trim()).filter((statement) => statement !== '');
}

/** Comment markers, a doubled quote and a backslash escape are each two characters long. */
const TWO_CHARS = 2;
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const DOLLAR_TAG = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;

function endOfComment(text: string, at: number): number | undefined {
  if (text.startsWith('--', at)) {
    const newline = text.indexOf('\n', at);
    return newline === -1 ? text.length : newline;
  }
  return text.startsWith('/*', at) ? endOfBlockComment(text, at) : undefined;
}

/** Block comments nest in Postgres, so each opener needs its own closer. */
function endOfBlockComment(text: string, start: number): number {
  let depth = 0;
  let at = start;
  while (at < text.length) {
    const pair = text.slice(at, at + TWO_CHARS);
    depth += pair === '/*' ? 1 : 0;
    depth -= pair === '*/' ? 1 : 0;
    at += pair === '/*' || pair === '*/' ? TWO_CHARS : 1;
    if (depth === 0) return at;
  }
  return text.length;
}

function endOfLiteral(text: string, at: number): number | undefined {
  const char = text[at];
  if (char === "'") return endOfQuoted(text, at, { quote: "'", escapes: escapeStyle(text, at) });
  if (char === '"') return endOfQuoted(text, at, { quote: '"', escapes: 'doubled' });
  return char === '$' ? endOfDollarQuoted(text, at) : undefined;
}

type EscapeStyle = 'doubled' | 'backslash';

/** An E before the quote, not ending a longer name, makes backslash an escape character. */
function escapeStyle(text: string, quoteAt: number): EscapeStyle {
  const prefix = text[quoteAt - 1] ?? '';
  const beforePrefix = text[quoteAt - TWO_CHARS] ?? '';
  const isEscapeString = /[Ee]/.test(prefix) && !IDENTIFIER_CHAR.test(beforePrefix);
  return isEscapeString ? 'backslash' : 'doubled';
}

interface QuoteRule {
  readonly quote: string;
  readonly escapes: EscapeStyle;
}

/** The index after the closing quote; a doubled quote is part of the text in both styles. */
function endOfQuoted(text: string, start: number, rule: QuoteRule): number {
  let at = start + 1;
  while (at < text.length) {
    const char = text[at];
    if (rule.escapes === 'backslash' && char === '\\') {
      at += TWO_CHARS;
    } else if (char === rule.quote && text[at + 1] === rule.quote) {
      at += TWO_CHARS;
    } else if (char === rule.quote) {
      return at + 1;
    } else {
      at += 1;
    }
  }
  return text.length;
}

/** `$$` or `$tag$`, but not `$1` and not a `$` that is part of a name such as `a$b`. */
function endOfDollarQuoted(text: string, start: number): number | undefined {
  if (IDENTIFIER_CHAR.test(text[start - 1] ?? '')) return undefined;
  DOLLAR_TAG.lastIndex = start;
  const tag = DOLLAR_TAG.exec(text)?.[0];
  if (tag === undefined) return undefined;
  const close = text.indexOf(tag, start + tag.length);
  return close === -1 ? text.length : close + tag.length;
}
