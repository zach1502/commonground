import { readFileSync } from 'node:fs';

/** One operation in apps/api/openapi.json, read at test time so the list cannot drift. */
export interface SpecRoute {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  /** Property names of the JSON request body, empty when the route takes no body. */
  readonly bodyKeys: readonly string[];
}

interface SpecSchema {
  readonly $ref?: string;
  readonly properties?: Record<string, unknown>;
  readonly allOf?: readonly SpecSchema[];
}

interface SpecOperation {
  readonly operationId: string;
  readonly requestBody?: { content?: Record<string, { schema?: SpecSchema }> };
}

interface SpecDocument {
  readonly paths: Record<string, Record<string, SpecOperation>>;
  readonly components?: { schemas?: Record<string, SpecSchema> };
}

const SPEC_URL = new URL('../../openapi.json', import.meta.url);
const REF_PREFIX = '#/components/schemas/';

function readSpec(): SpecDocument {
  return JSON.parse(readFileSync(SPEC_URL, 'utf8')) as SpecDocument;
}

function resolve(spec: SpecDocument, schema: SpecSchema | undefined): SpecSchema | undefined {
  if (schema?.$ref === undefined) return schema;
  return spec.components?.schemas?.[schema.$ref.slice(REF_PREFIX.length)];
}

function propertyNames(spec: SpecDocument, schema: SpecSchema | undefined): string[] {
  const resolved = resolve(spec, schema);
  const own = Object.keys(resolved?.properties ?? {});
  const inherited = (resolved?.allOf ?? []).flatMap((part) => propertyNames(spec, part));
  return [...own, ...inherited];
}

function bodyKeysOf(spec: SpecDocument, operation: SpecOperation): string[] {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  return propertyNames(spec, schema);
}

export function specRoutes(): readonly SpecRoute[] {
  const spec = readSpec();
  return Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => ({
      method: method.toUpperCase(),
      path,
      operationId: operation.operationId,
      bodyKeys: bodyKeysOf(spec, operation),
    })),
  );
}

/** The spec path with its {id} filled in, for a request. */
export function fillPath(path: string, id: string): string {
  return path.replace('{id}', encodeURIComponent(id));
}
