import { numberedLines, readText, selectFiles } from '../files.js';
import { COMMENT_OPENER, scopedTexts } from '../scan.js';
import type { Finding, PreflightRule, RuleContext } from '../types.js';

const ID = 'todo-audit';
export const TODO_GLOBS = ['**/*.{ts,tsx,js,mjs,cjs,css,md,sh,yml,yaml,sql}', '.husky/*'];
const SEED_GLOBS = ['packages/db/seed/**'];
const SEED_PLACEHOLDER = /\bTODO\(#seed/;
const MARKER = new RegExp(`${COMMENT_OPENER}[^\\n]*?\\b(TODO|FIXME)\\b(\\S*)`);
const TRACKED = /^\((?:#\d+|#seed)/;
const PLACEHOLDER_PREFIX = '(#seed';

export interface TodoMarker {
  readonly file: string;
  readonly line: number;
  readonly marker: string;
  readonly tracked: boolean;
  readonly placeholder: boolean;
}

/** Open-work markers in comments, with whether each links an issue or is a seed placeholder. */
export function todoMarkers(file: string, text: string): TodoMarker[] {
  return numberedLines(text).flatMap(({ line, text: lineText }) => {
    const match = MARKER.exec(lineText);
    if (match === null) {
      return [];
    }
    const suffix = match[2] ?? '';
    return [
      {
        file,
        line,
        marker: match[1] ?? '',
        tracked: TRACKED.test(suffix),
        placeholder: suffix.startsWith(PLACEHOLDER_PREFIX),
      },
    ];
  });
}

/** Every open-work marker in the files a run scans. */
export function scanTodos(ctx: RuleContext): TodoMarker[] {
  return scopedTexts(ctx, TODO_GLOBS).flatMap(({ file, text }) => todoMarkers(file, text));
}

/** Seed lines that still hold a placeholder, in any file type under packages/db/seed. */
export function seedPlaceholders(
  rootDir: string,
  files: readonly string[],
): { file: string; line: number }[] {
  return selectFiles(files, SEED_GLOBS).flatMap((file) =>
    numberedLines(readText(rootDir, file))
      .filter(({ text: lineText }) => SEED_PLACEHOLDER.test(lineText))
      .map(({ line }) => ({ file, line })),
  );
}

function toFinding(marker: TodoMarker, message: string): Finding {
  return { ruleId: ID, file: marker.file, line: marker.line, message };
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#code-smells',
  tier: 'quick',
  severity: 'error',
  summary:
    'TODO and FIXME comments link an issue; seed placeholders must be gone by the full tier.',
  fixHint: 'Write TODO(#12) with a real issue, or finish the work and delete the comment.',
  check(ctx) {
    const markers = scanTodos(ctx);
    const untracked = markers
      .filter(({ tracked }) => !tracked)
      .map((marker) => toFinding(marker, `${marker.marker} needs an issue link such as (#12)`));
    const placeholders =
      ctx.tier === 'full'
        ? seedPlaceholders(ctx.rootDir, ctx.files).map(({ file, line }) => ({
            ruleId: ID,
            file,
            line,
            message: 'seed placeholder must be written before the full tier passes',
          }))
        : [];
    return Promise.resolve([...untracked, ...placeholders]);
  },
};
