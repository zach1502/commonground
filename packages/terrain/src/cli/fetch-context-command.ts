import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  CONTEXT_BUFFER_M,
  CONTEXT_FEATURE_KINDS,
  type Clock,
  type SiteContext,
} from '@parkshape/core';

import { writeSiteContextFixture } from '../adapters/static/context-fixture.js';
import { readSiteFeaturesFixture } from '../adapters/static/fixture-files.js';
import { RECORDED_STOPS_FILE } from '../adapters/translink/gtfs-stops.js';
import { VancouverContextProvider } from '../adapters/vancouver/vancouver-context-provider.js';

import {
  COMMON_OPTIONS,
  commonArgs,
  fetchFor,
  parsedOrUndefined,
  USAGE_EXIT_CODE,
  type CliDeps,
  type CommonArgs,
} from './cli-common.js';

const JSON_INDENT = 2;

export const FETCH_CONTEXT_USAGE = 'usage: fetch-context [--out <dir>] [--record]';

export interface FetchContextDeps extends CliDeps {
  /** Stamps recordedAt in context.json. */
  readonly clock: Clock;
}

function summary(context: SiteContext): string[] {
  return CONTEXT_FEATURE_KINDS.map(
    (kind) =>
      `${kind}: ${String(context.features.filter((feature) => feature.kind === kind).length)}`,
  );
}

/** Writes raw/translink-stops.json, the stops the 16 MB feed gave inside the area. */
function stopsRecorder(common: CommonArgs, deps: CliDeps) {
  if (!common.record) return undefined;
  const rawDir = new URL('raw/', common.outDir);
  return async (feed: object) => {
    await mkdir(rawDir, { recursive: true });
    await writeFile(
      new URL(RECORDED_STOPS_FILE, rawDir),
      `${JSON.stringify(feed, null, JSON_INDENT)}\n`,
    );
    deps.log(`recorded raw/${RECORDED_STOPS_FILE}`);
  };
}

/**
 * Reads the parcel from <out>/features.json (run fetch-site first), fetches the streets,
 * sidewalks, parking, bikeways and bus stops within CONTEXT_BUFFER_M and writes context.json.
 * Returns the process exit code.
 */
export async function fetchContext(
  args: readonly string[],
  deps: FetchContextDeps,
): Promise<number> {
  const parsed = parsedOrUndefined(() =>
    parseArgs({ args: [...args], options: COMMON_OPTIONS, strict: true }),
  );
  if (parsed === undefined) {
    deps.log(FETCH_CONTEXT_USAGE);
    return USAGE_EXIT_CODE;
  }
  const common = commonArgs(parsed.values);
  const site = await readSiteFeaturesFixture(common.outDir);
  if (!site.ok) {
    deps.log(`cannot read the parcel, run fetch-site first: ${JSON.stringify(site.error)}`);
    return 1;
  }
  const recordStops = stopsRecorder(common, deps);
  const provider = new VancouverContextProvider({
    fetch: fetchFor(common, deps),
    clock: deps.clock,
    ...(recordStops === undefined ? {} : { recordStops }),
  });
  const { polygonWgs84 } = site.value.parcel;
  const context = await provider.getContext({ polygonWgs84, bufferM: CONTEXT_BUFFER_M });
  if (!context.ok) {
    deps.log(`context fetch failed: ${JSON.stringify(context.error)}`);
    return 1;
  }
  const file = await writeSiteContextFixture(common.outDir, {
    parkName: site.value.parkName,
    polygonWgs84,
    context: context.value,
  });
  [`wrote ${file.pathname}`, ...summary(context.value)].forEach((line) => {
    deps.log(line);
  });
  return 0;
}
