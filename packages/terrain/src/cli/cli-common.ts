import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { recordingFetch } from '../adapters/http/recorded-fetch.js';
import { JONATHAN_ROGERS_FIXTURE_DIR } from '../adapters/static/fixture-files.js';
import type { HttpFetch } from '../ports/http.js';

export const DEFAULT_PARK = 'Jonathan Rogers Park';

/** parseArgs options both commands accept. */
export const COMMON_OPTIONS = {
  out: { type: 'string' },
  record: { type: 'boolean' },
} as const;

/** Exit code for bad arguments, as most command-line tools use. */
export const USAGE_EXIT_CODE = 2;

/** Runs a parseArgs call; a bad flag becomes undefined instead of a thrown TypeError. */
export function parsedOrUndefined<R>(parse: () => R): R | undefined {
  try {
    return parse();
  } catch {
    return undefined;
  }
}

export interface CliDeps {
  readonly fetch: HttpFetch;
  readonly log: (line: string) => void;
}

export interface CommonArgs {
  readonly outDir: URL;
  readonly record: boolean;
}

export function commonArgs(values: {
  out?: string | undefined;
  record?: boolean | undefined;
}): CommonArgs {
  const { out } = values;
  return {
    outDir:
      out === undefined
        ? JONATHAN_ROGERS_FIXTURE_DIR
        : pathToFileURL(out.endsWith('/') ? out : `${out}/`),
    record: values.record === true,
  };
}

/** Wraps fetch so JSON responses land in <out>/raw when --record is set. */
export function fetchFor(common: CommonArgs, deps: CliDeps): HttpFetch {
  if (!common.record) return deps.fetch;
  const rawDir = new URL('raw/', common.outDir);
  return recordingFetch(deps.fetch, async (name, text) => {
    await mkdir(rawDir, { recursive: true });
    await writeFile(new URL(name, rawDir), text);
    deps.log(`recorded raw/${name}`);
  });
}
