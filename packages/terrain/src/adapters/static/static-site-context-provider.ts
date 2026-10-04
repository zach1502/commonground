import {
  compareContextFeatures,
  contextFeatureSchema,
  err,
  ok,
  polygonContains,
  type ContextFeature,
  type PlanePoint,
  type Result,
  type SiteContext,
} from '@parkshape/core';

import type {
  SiteContextError,
  SiteContextProvider,
  SiteContextRequest,
} from '../../ports/site-context-provider.js';
import {
  boxContains,
  bufferedParcelBox,
  clipPolyline,
  roundedLine,
  roundedPoint,
  type LocalBox,
} from '../projection/context-box.js';
import { siteFrameFor, type SiteFrame } from '../projection/site-frame.js';

import { readSiteContextFixture, type SiteContextFile } from './context-fixture.js';
import { JONATHAN_ROGERS_FIXTURE_DIR, type FixtureDir } from './fixture-files.js';

export type StaticSiteContextOptions =
  { readonly fixtureDir?: FixtureDir } | { readonly file: SiteContextFile };

/** Each parcel's centre lies inside the other: the request names the recorded park. */
function sameParcel(request: SiteFrame, recorded: SiteFrame): boolean {
  const inRequest = request.localPoint(recorded.frame.toWgs84(recorded.centre()));
  const inRecorded = recorded.localPoint(request.frame.toWgs84(request.centre()));
  return (
    polygonContains(request.parcel.polygonLocal, inRequest) &&
    polygonContains(recorded.parcel.polygonLocal, inRecorded)
  );
}

function moved(points: readonly PlanePoint[], shift: PlanePoint): PlanePoint[] {
  return points.map((point) => ({ x: point.x + shift.x, y: point.y + shift.y }));
}

/** A recorded feature in the request's frame and box: lines are cut, others kept or dropped. */
function fitted(feature: ContextFeature, shift: PlanePoint, box: LocalBox): ContextFeature[] {
  const { geometry } = feature;
  if (geometry.type === 'point') {
    const [position] = moved([geometry.position], shift).map(roundedPoint);
    return position !== undefined && boxContains(box, position)
      ? [contextFeatureSchema.parse({ ...feature, geometry: { ...geometry, position } })]
      : [];
  }
  if (geometry.type === 'polygon') {
    const ring = moved(geometry.ring, shift).map(roundedPoint);
    return ring.every((corner) => boxContains(box, corner))
      ? [contextFeatureSchema.parse({ ...feature, geometry: { ...geometry, ring } })]
      : [];
  }
  const pieces = clipPolyline(moved(geometry.points, shift), box)
    .map(roundedLine)
    .filter((piece) => piece.length > 1);
  return pieces.map((points, index) =>
    contextFeatureSchema.parse({
      ...feature,
      id: pieces.length === 1 ? feature.id : `${feature.id}-${String(index + 1)}`,
      geometry: { ...geometry, points },
    }),
  );
}

/**
 * Serves the recorded context around Jonathan Rogers Park, so the app runs offline. A parcel the
 * recording does not cover gets an empty list, not an error.
 */
export class StaticSiteContextProvider implements SiteContextProvider {
  readonly name = 'static';
  private file: Promise<Result<SiteContextFile, SiteContextError>> | undefined;

  constructor(private readonly options: StaticSiteContextOptions = {}) {}

  async getContext(request: SiteContextRequest): Promise<Result<SiteContext, SiteContextError>> {
    const { bufferM } = request;
    if (!Number.isFinite(bufferM) || bufferM < 0) {
      return err({
        kind: 'invalidRequest',
        reason: 'bufferM must be a finite number of 0 or more',
      });
    }
    this.file ??=
      'file' in this.options
        ? Promise.resolve(ok(this.options.file))
        : readSiteContextFixture(this.options.fixtureDir ?? JONATHAN_ROGERS_FIXTURE_DIR);
    const file = await this.file;
    if (!file.ok) return file;
    const { recordedAt } = file.value.context;
    const site = siteFrameFor(request.polygonWgs84);
    const recorded = siteFrameFor(file.value.parcel.polygonWgs84);
    if (!sameParcel(site, recorded)) return ok({ features: [], bufferM, recordedAt });
    const { lon, lat } = recorded.parcel.origin;
    const shift = site.localPoint([lon, lat]);
    const box = bufferedParcelBox(site.parcel.polygonLocal, bufferM);
    const features = file.value.context.features
      .flatMap((feature) => fitted(feature, shift, box))
      .sort(compareContextFeatures);
    return ok({ features, bufferM, recordedAt });
  }
}
