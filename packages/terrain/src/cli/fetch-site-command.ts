import { parseArgs } from 'node:util';

import { OsmOverpassProvider } from '../adapters/osm/osm-overpass-provider.js';
import { writeSiteFeaturesFixture } from '../adapters/static/fixture-files.js';
import { VancouverOpenDataProvider } from '../adapters/vancouver/vancouver-open-data-provider.js';
import type { ProposedFeature } from '../ports/site-features-provider.js';

import {
  COMMON_OPTIONS,
  commonArgs,
  DEFAULT_PARK,
  fetchFor,
  parsedOrUndefined,
  USAGE_EXIT_CODE,
  type CliDeps,
} from './cli-common.js';

export const FETCH_SITE_USAGE =
  'usage: fetch-site [--park "Jonathan Rogers Park"] [--out <dir>] [--record] [--skip-osm]';

function summary(features: readonly ProposedFeature[]): string[] {
  const trees = features.filter((feature) => feature.kind === 'tree');
  const gardens = features.filter((feature) => feature.kind === 'garden');
  const plots = gardens.reduce((total, garden) => total + (garden.attributes.plots ?? 0), 0);
  const reviewOnly = features.filter((feature) => feature.provenance.reviewOnly === true);
  return [
    `trees: ${String(trees.length)} (${String(trees.filter((tree) => tree.suggestedLocked).length)} suggested locked)`,
    `gardens: ${String(gardens.length)} with ${String(plots)} plots`,
    `review-only features from OpenStreetMap: ${String(reviewOnly.length)}`,
  ];
}

/**
 * Fetches the parcel and features for a park from Vancouver Open Data, adds OSM footprints
 * marked review only, and writes features.json. Returns the process exit code.
 */
export async function fetchSite(args: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parsedOrUndefined(() =>
    parseArgs({
      args: [...args],
      options: { ...COMMON_OPTIONS, park: { type: 'string' }, 'skip-osm': { type: 'boolean' } },
      strict: true,
    }),
  );
  if (parsed === undefined) {
    deps.log(FETCH_SITE_USAGE);
    return USAGE_EXIT_CODE;
  }
  const { values } = parsed;
  const common = commonArgs(values);
  const parkName = values.park ?? DEFAULT_PARK;
  const fetch = fetchFor(common, deps);
  const vancouver = await new VancouverOpenDataProvider({ fetch }).getFeatures({ parkName });
  if (!vancouver.ok) {
    deps.log(`Vancouver Open Data failed: ${JSON.stringify(vancouver.error)}`);
    return 1;
  }
  const { parcel } = vancouver.value;
  let features = vancouver.value.features;
  if (values['skip-osm'] !== true) {
    const osm = await new OsmOverpassProvider({ fetch }).getFeatures({
      polygonWgs84: parcel.polygonWgs84,
    });
    if (osm.ok) features = [...features, ...osm.value.features];
    else deps.log(`OpenStreetMap skipped: ${JSON.stringify(osm.error)}`);
  }
  await writeSiteFeaturesFixture(common.outDir, { parkName, features: { parcel, features } });
  [`wrote ${new URL('features.json', common.outDir).pathname}`, ...summary(features)].forEach(
    (line) => {
      deps.log(line);
    },
  );
  return 0;
}
