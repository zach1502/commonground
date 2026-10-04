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
