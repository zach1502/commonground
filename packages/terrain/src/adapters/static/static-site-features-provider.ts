import { err, ok, type Result } from '@parkshape/core';

import { withRecordedGardenPlots } from '../../garden-plots.js';
import type {
  SiteFeatures,
  SiteFeaturesError,
  SiteFeaturesProvider,
  SiteFeaturesRequest,
} from '../../ports/site-features-provider.js';

import { siteInDrawnOutline } from './drawn-outline.js';
import {
  JONATHAN_ROGERS_FIXTURE_DIR,
  readSiteFeaturesFixture,
  type FixtureDir,
  type SiteFeaturesFile,
} from './fixture-files.js';

export type StaticSiteFeaturesOptions =
  { readonly fixtureDir?: FixtureDir } | { readonly file: SiteFeaturesFile };

/** The recorded site, or the part inside an outline drawn without a park name. */
function siteFor(request: SiteFeaturesRequest, file: SiteFeaturesFile): SiteFeatures {
  const recorded = { parcel: file.parcel, features: file.features };
  const drawn = request.parkName === undefined ? request.polygonWgs84 : undefined;
  return drawn === undefined ? recorded : siteInDrawnOutline(recorded, drawn);
}

/**
 * Serves a recorded parcel and feature list from disk so the app runs offline. A drawn outline
 * without a park name becomes the parcel, with the recorded features inside it.
 */
export class StaticSiteFeaturesProvider implements SiteFeaturesProvider {
  readonly name = 'static';
  private file: Promise<Result<SiteFeaturesFile, SiteFeaturesError>> | undefined;

  constructor(private readonly options: StaticSiteFeaturesOptions = {}) {}

  async getFeatures(
    request: SiteFeaturesRequest,
  ): Promise<Result<SiteFeatures, SiteFeaturesError>> {
    if (request.parkName === undefined && request.polygonWgs84 === undefined) {
      return err({ kind: 'invalidRequest', reason: 'give a parkName or a polygonWgs84' });
    }
    this.file ??=
      'file' in this.options
        ? Promise.resolve(ok(this.options.file))
        : readSiteFeaturesFixture(this.options.fixtureDir ?? JONATHAN_ROGERS_FIXTURE_DIR);
    const file = await this.file;
    if (!file.ok) return file;
    if (request.parkName !== undefined && request.parkName !== file.value.parkName) {
      return err({ kind: 'parkNotFound', parkName: request.parkName });
    }
    const site = siteFor(request, file.value);
    return ok({ parcel: site.parcel, features: withRecordedGardenPlots(site.features) });
  }
}
