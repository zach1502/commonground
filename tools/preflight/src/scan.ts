import { fileExists, readText, selectFiles } from './files.js';
import type { RuleContext } from './types.js';

export const CODE_GLOBS = ['**/*.{ts,tsx,js,mjs,cjs}'];
export const TEST_GLOBS = ['**/*.test.{ts,tsx,js}', '**/__contracts__/**', '**/__live__/**'];
// Comment openers in TS, JS, CSS, shell, YAML and Markdown.
export const COMMENT_OPENER = String.raw`(?:\/\/|\/\*|^\s*\*|(?:^|\s)#|<!--)`;

/** Files in scope for this run that match the globs and still exist on disk. */
export function scopedFiles(
  ctx: RuleContext,
  globs: readonly string[],
  exclude: readonly string[] = [],
): string[] {
  return selectFiles(ctx.files, globs, exclude).filter((file) => fileExists(ctx.rootDir, file));
}

export interface FileText {
  readonly file: string;
  readonly text: string;
}

/** Reads each scoped file once. */
export function scopedTexts(
  ctx: RuleContext,
  globs: readonly string[],
  exclude: readonly string[] = [],
): FileText[] {
  return scopedFiles(ctx, globs, exclude).map((file) => ({
    file,
    text: readText(ctx.rootDir, file),
  }));
}

/** An info finding for conditional rules whose inputs do not exist yet. */
export function notApplicable(
  ruleId: string,
  reason: string,
): { ruleId: string; message: string; severity: 'info' } {
  return { ruleId, message: `not applicable until ${reason}`, severity: 'info' };
}
