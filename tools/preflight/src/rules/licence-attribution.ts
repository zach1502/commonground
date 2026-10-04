import { listRepoFiles, readJson, selectFiles } from '../files.js';
import { notApplicable } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'licence-attribution';
const ASSET_MANIFEST = 'tools/asset-pipeline/manifest.json';
const TERRAIN_SOURCES = 'packages/terrain/src/adapters/**/sources.json';
const LOCALE_FILE = 'apps/web/src/locales/en.json';
const ATTRIBUTION_KEY = /attribution/i;

function entryName(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null) {
    const record = entry as Record<string, unknown>;
    const name = record.source ?? record.name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

/** Source names from a manifest shaped as an array or as { sources: [...] }. */
export function sourceNames(manifest: unknown): string[] {
  const list = Array.isArray(manifest)
    ? manifest
    : (manifest as { sources?: unknown } | undefined)?.sources;
  return Array.isArray(list)
    ? list.map(entryName).filter((name): name is string => name !== undefined)
    : [];
}

/** Every string stored under a key that mentions attribution, joined. */
export function attributionText(value: unknown, key = ''): string {
  if (typeof value === 'string') {
    return ATTRIBUTION_KEY.test(key) ? value : '';
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .map(([childKey, child]) =>
        attributionText(child, ATTRIBUTION_KEY.test(key) ? key : childKey),
      )
      .join('\n');
  }
  return '';
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'CONTENT.md#ui-strings',
  tier: 'standard',
  severity: 'error',
  summary: 'Every asset and terrain source named in a manifest is credited in the UI attribution.',
  fixHint: 'Add the source name to the attribution string in apps/web/src/locales/en.json.',
  check(ctx) {
    const manifests = selectFiles(listRepoFiles(ctx.rootDir), [ASSET_MANIFEST, TERRAIN_SOURCES]);
    if (manifests.length === 0) {
      return Promise.resolve([
        notApplicable(ID, 'the asset pipeline or terrain task writes a source manifest'),
      ]);
    }
    const credited = attributionText(readJson(ctx.rootDir, LOCALE_FILE));
    const findings = manifests.flatMap((file) =>
      sourceNames(readJson(ctx.rootDir, file))
        .filter((name) => !credited.includes(name))
        .map((name): Finding => ({
          ruleId: ID,
          file,
          message: `source "${name}" is not credited in the attribution string in ${LOCALE_FILE}`,
        })),
    );
    return Promise.resolve(findings);
  },
};
