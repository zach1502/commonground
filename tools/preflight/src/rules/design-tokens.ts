import path from 'node:path';

import { resolveBin } from '../bin.js';
import { numberedLines } from '../files.js';
import { scopedFiles, scopedTexts } from '../scan.js';
import type { Finding, PreflightRule, RuleContext } from '../types.js';

const ID = 'design-tokens';
const MOTION_HOME = ['packages/ui/src/motion/**', 'packages/scene/src/motion/**'];
const CSS_MOTION = /(?:^|[\s;{])(?:animation|transition)(?:-[a-z-]+)?\s*:|@keyframes\b/;
const TSX_MOTION = /\b(?:animation|transition)\w*\s*[:=]|@keyframes\b/;

interface StylelintWarning {
  readonly line?: number;
  readonly text?: string;
  readonly severity?: string;
}

interface StylelintResult {
  readonly source?: string;
  readonly warnings?: readonly StylelintWarning[];
}

/** Parses stylelint's JSON formatter output, which lands on stdout or stderr. */
export function parseStylelint(output: string): StylelintResult[] {
  const start = output.indexOf('[');
  if (start === -1) {
    return [];
  }
  try {
    return JSON.parse(output.slice(start)) as StylelintResult[];
  } catch {
    return [];
  }
}

async function stylelintFindings(ctx: RuleContext, files: readonly string[]): Promise<Finding[]> {
  const bin = resolveBin(ctx.rootDir, 'stylelint');
  if (bin === undefined) {
    return [
      { ruleId: ID, severity: 'info', message: 'stylelint is not installed; token check skipped' },
    ];
  }
  const result = await ctx.exec(bin, ['--formatter', 'json', '--allow-empty-input', ...files], {
    cwd: ctx.rootDir,
  });
  return parseStylelint(`${result.stdout}\n${result.stderr}`).flatMap((entry) =>
    (entry.warnings ?? []).map((warning): Finding => ({
      ruleId: ID,
      file: path.relative(ctx.rootDir, entry.source ?? ''),
      ...(warning.line === undefined ? {} : { line: warning.line }),
      message: warning.text ?? 'stylelint problem',
      severity: warning.severity === 'warning' ? 'warn' : 'error',
    })),
  );
}

function motionFindings(ctx: RuleContext): Finding[] {
  const texts = scopedTexts(ctx, ['**/*.{css,tsx}'], MOTION_HOME);
  return texts.flatMap(({ file, text }) => {
    const pattern = file.endsWith('.css') ? CSS_MOTION : TSX_MOTION;
    return numberedLines(text)
      .filter(({ text: lineText }) => pattern.test(lineText))
      .map(({ line }) => ({
        ruleId: ID,
        file,
        line,
        message: 'declares motion outside packages/ui/src/motion and packages/scene/src/motion',
      }));
  });
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'DESIGN.md#motion',
  tier: 'quick',
  severity: 'error',
  summary:
    'CSS uses design tokens, and motion lives only in packages/ui/src/motion or packages/scene/src/motion.',
  fixHint:
    'Use a var() token, and animate through the motion helpers in packages/ui or packages/scene.',
  async check(ctx) {
    const css = scopedFiles(ctx, ['**/*.css']);
    const tokens = css.length > 0 ? await stylelintFindings(ctx, css) : [];
    return [...tokens, ...motionFindings(ctx)];
  },
};
