import { listRepoFiles, readJson, readText, selectFiles } from '../files.js';
import { notApplicable } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'openapi-drift';
const SPEC_FILE = 'apps/api/openapi.json';
const GENERATED_GLOBS = ['packages/api-client/src/generated/**'];
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options']);

interface OpenApiSpec {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, { operationId?: string }>>>>;
}

/** Every path and operationId in the spec: the names the generated client must contain. */
export function specNames(spec: OpenApiSpec): string[] {
  return Object.entries(spec.paths ?? {}).flatMap(([route, operations]) => [
    route,
    ...Object.entries(operations)
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([, operation]) => operation.operationId)
      .filter((id): id is string => typeof id === 'string'),
  ]);
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#tests',
  tier: 'standard',
  severity: 'error',
  summary: 'The generated API client names every path and operation in apps/api/openapi.json.',
  fixHint: 'Regenerate the client in packages/api-client/src/generated from the spec.',
  check(ctx) {
    const generated = selectFiles(listRepoFiles(ctx.rootDir), GENERATED_GLOBS);
    const spec = readJson(ctx.rootDir, SPEC_FILE) as OpenApiSpec | undefined;
    if (spec === undefined || generated.length === 0) {
      return Promise.resolve([
        notApplicable(ID, 'the API task adds openapi.json and the generated client'),
      ]);
    }
    const client = generated.map((file) => readText(ctx.rootDir, file)).join('\n');
    const findings = specNames(spec)
      .filter((name) => !client.includes(name))
      .map((name): Finding => ({
        ruleId: ID,
        file: GENERATED_GLOBS[0] ?? SPEC_FILE,
        message: `"${name}" is in ${SPEC_FILE} but not in the generated client`,
      }));
    return Promise.resolve(findings);
  },
};
