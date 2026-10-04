import { fileExists, lineOf, packageOf } from '../files.js';
import { matchesAny } from '../glob.js';
import { CODE_GLOBS, scopedTexts } from '../scan.js';
import type { Finding, PreflightRule, RuleContext } from '../types.js';

const ID = 'adapter-boundary';
const VENDOR_SDKS = [
  'three',
  '@react-three',
  'maplibre-gl',
  'drizzle-orm',
  '@electric-sql/pglite',
  'geotiff',
  'proj4',
  '@supabase',
  'openai',
  '@gltf-transform',
  'postprocessing',
  'n8ao',
  '@aws-sdk',
  'hono/vercel',
  'hono/aws-lambda',
];
const ALLOWED_FILES = [
  'packages/*/src/adapters/**',
  'packages/scene/**',
  'packages/ui/**',
  'apps/api/src/entry.*.ts',
  'tools/**',
];
// Packages whose manifest may list a vendor SDK: wrappers, hosts, and packages with adapters.
const ALLOWED_MANIFEST_PACKAGES = new Set(['packages/scene', 'packages/ui', 'apps/api']);
const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

export function isVendorSdk(specifier: string): boolean {
  return VENDOR_SDKS.some((sdk) => specifier === sdk || specifier.startsWith(`${sdk}/`));
}

function importFindings(file: string, text: string): Finding[] {
  return [...text.matchAll(IMPORT_PATTERN)]
    .filter((match) => isVendorSdk(match[1] ?? ''))
    .map((match) => ({
      ruleId: ID,
      file,
      line: lineOf(text, match.index),
      message: `imports vendor SDK "${match[1] ?? ''}" outside an adapter or wrapper package`,
    }));
}

function manifestDependencies(text: string): string[] {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const deps = manifest[field];
    return typeof deps === 'object' && deps !== null ? Object.keys(deps) : [];
  });
}

function manifestFindings(ctx: RuleContext, file: string, text: string): Finding[] {
  const pkg = packageOf(file);
  const hasAdapters = fileExists(ctx.rootDir, `${pkg}/src/adapters`);
  if (ALLOWED_MANIFEST_PACKAGES.has(pkg) || hasAdapters) {
    return [];
  }
  return manifestDependencies(text)
    .filter(isVendorSdk)
    .map((dep) => ({
      ruleId: ID,
      file,
      message: `depends on vendor SDK "${dep}" but has no src/adapters directory`,
    }));
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#ports-and-adapters',
  tier: 'quick',
  severity: 'error',
  summary: 'Vendor SDKs are imported only in adapters, the scene and ui wrappers and API entries.',
  fixHint: 'Move the import into packages/<pkg>/src/adapters and expose it through a port.',
  check(ctx) {
    const code = scopedTexts(
      ctx,
      CODE_GLOBS.map((glob) => `{apps,packages}/${glob}`),
    ).filter(({ file }) => !matchesAny(file, ALLOWED_FILES));
    const manifests = scopedTexts(ctx, ['{apps,packages}/*/package.json']);
    return Promise.resolve([
      ...code.flatMap(({ file, text }) => importFindings(file, text)),
      ...manifests.flatMap(({ file, text }) => manifestFindings(ctx, file, text)),
    ]);
  },
};
