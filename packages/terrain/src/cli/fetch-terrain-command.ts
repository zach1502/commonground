import { parseArgs } from 'node:util';

import { ChainProvider } from '../adapters/chain/chain-provider.js';
import { HrdemCogProvider, MrdemProvider } from '../adapters/cog/cog-terrain-providers.js';
import { localFrameFor } from '../adapters/projection/local-frame.js';
import {
  readSiteFeaturesFixture,
  writeHeightmapFixture,
} from '../adapters/static/fixture-files.js';
import { encodeHeightmap } from '../heightmap-codec.js';
import type { HttpFetch } from '../ports/http.js';
import type { TerrainProvider, TerrainResult } from '../ports/terrain-provider.js';

import {
  COMMON_OPTIONS,
  commonArgs,
  fetchFor,
  parsedOrUndefined,
  USAGE_EXIT_CODE,
  type CliDeps,
} from './cli-common.js';

const ELEVATION_DECIMALS = 2;

export const FETCH_TERRAIN_USAGE =
  'usage: fetch-terrain [--provider hrdem|mrdem|chain] [--resolution 1] [--out <dir>] [--record]';

function providerNamed(name: string, fetch: HttpFetch): TerrainProvider | undefined {
  const hrdem = new HrdemCogProvider({ fetch });
  const mrdem = new MrdemProvider({ fetch });
  const byName: Record<string, TerrainProvider> = {
    hrdem,
    mrdem,
    chain: new ChainProvider([hrdem, mrdem]),
  };
  return byName[name];
}

function summary(result: TerrainResult): string[] {
  const { heightmap, source, crs, attempts } = result;
  const values = [...heightmap.elevations];
  const tried = (attempts ?? [])
    .map((attempt) => `${attempt.provider} ${attempt.outcome}`)
    .join(', ');
  return [
    `grid: ${String(heightmap.width)} x ${String(heightmap.height)} cells at ${String(heightmap.resolutionM)} m`,
    `elevation: ${Math.min(...values).toFixed(ELEVATION_DECIMALS)} to ${Math.max(...values).toFixed(ELEVATION_DECIMALS)} m`,
    `source: ${source.name}, read in ${crs}`,
    ...(tried === '' ? [] : [`attempts: ${tried}`]),
  ];
}

/**
 * Reads the parcel from <out>/features.json (run fetch-site first), fetches its DTM window and
 * writes heightmap.json and heightmap.bin. Returns the process exit code.
 */
export async function fetchTerrain(args: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parsedOrUndefined(() =>
    parseArgs({
      args: [...args],
      options: { ...COMMON_OPTIONS, provider: { type: 'string' }, resolution: { type: 'string' } },
      strict: true,
    }),
  );
  const values = parsed?.values;
  if (values === undefined) {
    deps.log(FETCH_TERRAIN_USAGE);
    return USAGE_EXIT_CODE;
  }
  const common = commonArgs(values);
  const resolutionM = Number(values.resolution ?? '1');
  const provider = providerNamed(values.provider ?? 'chain', fetchFor(common, deps));
  if (provider === undefined || !(resolutionM > 0)) {
    deps.log(FETCH_TERRAIN_USAGE);
    return USAGE_EXIT_CODE;
  }
  const site = await readSiteFeaturesFixture(common.outDir);
  if (!site.ok) {
    deps.log(`cannot read the parcel, run fetch-site first: ${JSON.stringify(site.error)}`);
    return 1;
  }
  const polygonWgs84 = site.value.parcel.polygonWgs84;
  const result = await provider.getHeightmap({ polygonWgs84, resolutionM });
  if (!result.ok) {
    deps.log(`terrain fetch failed: ${JSON.stringify(result.error)}`);
    return 1;
  }
  const frameOrigin = localFrameFor(polygonWgs84).origin;
  await writeHeightmapFixture(
    common.outDir,
    encodeHeightmap({ result: result.value, polygonWgs84, frameOrigin }),
  );
  [`wrote ${new URL('heightmap.json', common.outDir).pathname}`, ...summary(result.value)].forEach(
    (line) => {
      deps.log(line);
    },
  );
  return 0;
}
