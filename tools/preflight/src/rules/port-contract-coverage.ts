import { fileExists, listRepoFiles, packageOf, readText, selectFiles } from '../files.js';
import { scopedTexts, TEST_GLOBS, type FileText } from '../scan.js';
import type { Finding, PreflightRule, RuleContext } from '../types.js';

const ID = 'port-contract-coverage';
const EXPORT_PATTERN =
  /\bexport\s+(?:abstract\s+)?(?:class\s+(\w+)|(?:async\s+)?function\s+(create\w+)|const\s+(create\w+))/g;
const CONTRACT_IMPORT = /from\s*['"][^'"]*__contracts__\//;

/** Exported adapter classes and create* factories declared in a source file. */
export function adapterExports(text: string): string[] {
  return [...text.matchAll(EXPORT_PATTERN)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    .filter((name) => name !== '');
}

/**
 * Text that counts as running an adapter through a contract: the files in __contracts__
 * and any test in the package that imports a contract from there.
 */
function contractUsages(ctx: RuleContext, pkg: string): string {
  const files = listRepoFiles(ctx.rootDir);
  const contracts = selectFiles(files, [`${pkg}/src/ports/__contracts__/**`]);
  const tests = selectFiles(files, [`${pkg}/src/**/*.test.{ts,tsx}`]);
  const importing = tests
    .map((file) => readText(ctx.rootDir, file))
    .filter((text) => CONTRACT_IMPORT.test(text));
  return [...contracts.map((file) => readText(ctx.rootDir, file)), ...importing].join('\n');
}

function packageFindings(ctx: RuleContext, pkg: string, adapters: readonly FileText[]): Finding[] {
  const contractsDir = `${pkg}/src/ports/__contracts__`;
  if (!fileExists(ctx.rootDir, contractsDir)) {
    return [
      {
        ruleId: ID,
        file: contractsDir,
        severity: 'warn',
        message: `${pkg} has adapters but no ports/__contracts__ directory`,
      },
    ];
  }
  const usages = contractUsages(ctx, pkg);
  return adapters.flatMap(({ file, text }) =>
    adapterExports(text)
      .filter((name) => !new RegExp(`\\b${name}\\b`).test(usages))
      .map((name) => ({
        ruleId: ID,
        file,
        message: `${name} is not run through a contract test in ${contractsDir}`,
      })),
  );
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#ports-and-adapters',
  tier: 'standard',
  severity: 'error',
  summary: 'Every adapter class or factory runs through its port contract test.',
  fixHint: 'Pass the adapter factory to the contract function in src/ports/__contracts__.',
  check(ctx) {
    const adapters = scopedTexts(ctx, ['packages/*/src/adapters/**/*.{ts,tsx}'], TEST_GLOBS);
    const byPackage = new Map<string, FileText[]>();
    for (const adapter of adapters) {
      const pkg = packageOf(adapter.file);
      byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), adapter]);
    }
    return Promise.resolve(
      [...byPackage.entries()].flatMap(([pkg, files]) => packageFindings(ctx, pkg, files)),
    );
  },
};
