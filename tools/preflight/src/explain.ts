import { fileExists, readText } from './files.js';
import type { PreflightRule } from './types.js';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6}) (.+)$/;

/** GitHub-style anchor for a heading. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .trim()
    .replaceAll(' ', '-');
}

interface Heading {
  readonly depth: number;
  readonly slug: string;
}

/** The heading on each line, or undefined for prose and for lines inside fenced code. */
function headingsByLine(lines: readonly string[]): (Heading | undefined)[] {
  let inFence = false;
  return lines.map((line) => {
    inFence = FENCE.test(line) ? !inFence : inFence;
    const match = inFence ? null : HEADING.exec(line);
    return match === null
      ? undefined
      : { depth: match[1]?.length ?? 0, slug: slugify(match[2] ?? '') };
  });
}

/** The section an anchor points to, up to the next heading of the same or higher level. */
export function sectionForAnchor(source: string, anchor: string): string | undefined {
  const lines = source.split('\n');
  const headings = headingsByLine(lines);
  const start = headings.findIndex((heading) => heading?.slug === anchor);
  const depth = headings[start]?.depth;
  if (depth === undefined) {
    return undefined;
  }
  const next = headings.findIndex(
    (heading, index) => index > start && heading !== undefined && heading.depth <= depth,
  );
  return lines
    .slice(start, next === -1 ? lines.length : next)
    .join('\n')
    .trim();
}

/** The --explain report for one rule. */
export function explainRule(rootDir: string, rule: PreflightRule): string[] {
  const [docFile = '', anchor = ''] = rule.doc.split('#');
  const section = fileExists(rootDir, docFile)
    ? sectionForAnchor(readText(rootDir, docFile), anchor)
    : undefined;
  return [
    `${rule.id} (${rule.tier} tier, ${rule.severity})`,
    `Checks: ${rule.summary}`,
    `Fix: ${rule.fixHint}`,
    `Doc: ${rule.doc}`,
    '',
    section ?? `The section ${rule.doc} was not found.`,
  ];
}

/** The reply for an unknown rule id. */
export function unknownRule(id: string, rules: readonly PreflightRule[]): string[] {
  return [`Unknown rule "${id}". Known rules:`, ...rules.map((rule) => `  ${rule.id}`)];
}
