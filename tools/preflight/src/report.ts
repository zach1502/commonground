import type { RuleGroup, RunReport } from './runner.js';
import type { Finding } from './types.js';

const LABELS = { error: 'FAIL', warn: 'WARN', info: 'INFO' } as const;
const MAX_FINDINGS_PER_GROUP = 20;

function location(finding: Finding): string {
  if (finding.file === undefined) {
    return '';
  }
  return finding.line === undefined
    ? `${finding.file}: `
    : `${finding.file}:${String(finding.line)}: `;
}

function indent(text: string): string[] {
  return text.split('\n').map((line) => `    ${line}`);
}

function groupLines(group: RuleGroup): string[] {
  const doc = group.doc === '' ? '' : `  (${group.doc})`;
  const head = `${LABELS[group.severity]} ${group.ruleId}${doc}`;
  if (group.severity === 'info') {
    return group.findings.map((finding) => `${head}: ${location(finding)}${finding.message}`);
  }
  const shown = group.findings.slice(0, MAX_FINDINGS_PER_GROUP);
  const hidden = group.findings.length - shown.length;
  return [
    head,
    ...shown.flatMap((finding) => indent(`${location(finding)}${finding.message}`)),
    ...(hidden > 0 ? [`    and ${String(hidden)} more`] : []),
    ...(group.fixHint === '' ? [] : [`  Fix: ${group.fixHint}`]),
  ];
}

function count(groups: readonly RuleGroup[], severity: RuleGroup['severity']): number {
  return groups.filter((group) => group.severity === severity).length;
}

/** The human-readable report. Errors first, then warnings, then info lines. */
export function formatReport(report: RunReport, title: string): string[] {
  const order = ['error', 'warn', 'info'] as const;
  const sorted = order.flatMap((severity) =>
    report.groups.filter((group) => group.severity === severity),
  );
  const summary = [
    `${String(count(report.groups, 'error'))} failing`,
    `${String(count(report.groups, 'warn'))} warning`,
    `${String(count(report.groups, 'info'))} info`,
  ].join(', ');
  return [
    title,
    ...sorted.flatMap(groupLines),
    `preflight ${report.exitCode === 0 ? 'passed' : 'failed'}: ${summary}.`,
  ];
}
