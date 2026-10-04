// Types for the JS prose checker in tools/textlint-rules, shared with textlint and commitlint.
declare module '@parkshape/textlint-rule-content/checker' {
  export interface ContentFinding {
    readonly id: string;
    readonly index: number;
    readonly length: number;
    readonly message: string;
    readonly severity: 'error' | 'warning';
  }

  export function checkText(
    text: string,
    options: { readonly scope: 'markdown' | 'locales' | 'all' },
  ): ContentFinding[];

  export function checkMarkdownSource(source: string): ContentFinding[];

  export function maskMarkdown(source: string): string;
}

declare module '@parkshape/textlint-rule-content/locale-strings' {
  import type { ContentFinding } from '@parkshape/textlint-rule-content/checker';

  export interface LocaleProblem {
    readonly file: string;
    readonly pointer: string;
    readonly finding: ContentFinding;
  }

  export function lintJsonText(text: string, file: string, scope?: string): LocaleProblem[];
}

declare module '@parkshape/textlint-rule-content/readability' {
  import type { ContentFinding } from '@parkshape/textlint-rule-content/checker';

  export function isDocFile(relativePath: string): boolean;

  export function paragraphReadabilityFindings(
    source: string,
    options?: { readonly limit?: number; readonly severity?: 'error' | 'warning' },
  ): ContentFinding[];
}

declare module '@parkshape/textlint-rule-content/locale-strings' {
  export function lintLocaleReadability(text: string, file: string): LocaleProblem[];
}

declare module '@parkshape/textlint-rule-content/redundancy' {
  export interface RedundancyFinding {
    readonly pointer: string;
    readonly id: string;
    readonly message: string;
    readonly severity: 'error';
  }

  export function lintRedundancy(text: string, config?: unknown): RedundancyFinding[];
}

declare module '@parkshape/textlint-rule-content/term-bans' {
  export interface TermBanMatcher {
    readonly term: string;
    readonly re: RegExp;
  }

  export interface TermBanFinding {
    readonly pointer: string;
    readonly term: string;
    readonly message: string;
    readonly severity: 'error';
  }

  export function compileTermBans(terms: readonly string[]): TermBanMatcher[];

  export function lintTermBans(
    text: string,
    matchers?: readonly TermBanMatcher[],
  ): TermBanFinding[];
}
