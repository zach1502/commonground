import { polygonContains, type LocalPoint } from '@parkshape/core';

import { outerRing, type GeoJsonPolygon } from '../../geojson.js';
import type { ProposedFeature, SiteFeatures } from '../../ports/site-features-provider.js';
import { siteFrameFor, type SiteFrame } from '../projection/site-frame.js';

function sameRing(a: GeoJsonPolygon, b: GeoJsonPolygon): boolean {
  return JSON.stringify(outerRing(a)) === JSON.stringify(outerRing(b));
}

/** A recorded feature moved into the drawn parcel's frame, or undefined when it falls outside. */
function moved(feature: ProposedFeature, from: SiteFrame, to: SiteFrame) {
  const place = (point: LocalPoint) => to.localPoint(from.frame.toWgs84(point));
  const inside = (point: LocalPoint) => polygonContains(to.parcel.polygonLocal, point);
  if ('position' in feature) {
    const position = place(feature.position);
    return inside(position) ? { ...feature, position } : undefined;
  }
  const polygon = to.localPolygon(feature.polygon.map((point) => from.frame.toWgs84(point)));
  return polygon?.every(inside) === true ? { ...feature, polygon } : undefined;
}

/**
 * The recorded site cut to an outline the planner drew: the drawn ring is the parcel, in its own
 * frame, and only the recorded features inside it stay. The recorded outline itself, or a park
 * name, serves the recording as it is.
 */
export function siteInDrawnOutline(recorded: SiteFeatures, drawn: GeoJsonPolygon): SiteFeatures {
  if (sameRing(recorded.parcel.polygonWgs84, drawn)) return recorded;
  const from = siteFrameFor(recorded.parcel.polygonWgs84);
  const to = siteFrameFor(drawn);
  const features = recorded.features.flatMap((feature) => moved(feature, from, to) ?? []);
  return { parcel: to.parcel, features };
}
