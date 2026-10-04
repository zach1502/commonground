import { parcelSchema, type Parcel } from '@parkshape/core';

import type { NewProjectInput, SiteFeatures } from '../api/staff-api';

import { withoutZones } from './baseline';
import type { WizardState } from './wizard-state';

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const DRAWN_SITE_ID = 'drawn-site';

function slug(name: string): string {
  const cleaned = name.toLowerCase().replace(NON_SLUG, '-').replace(EDGE_HYPHENS, '');
  return cleaned === '' ? DRAWN_SITE_ID : cleaned;
}

/** The core parcel for a project: the site outline in local metres and its WGS84 origin. */
export function parcelFrom(site: SiteFeatures, name: string): Parcel {
  return parcelSchema.parse({
    id: slug(site.parkName ?? name),
    name,
    polygon: site.parcel.polygonLocal,
    origin: site.parcel.origin,
  });
}

/** The POST /projects body, or null while an earlier step is missing. */
export function projectInputFrom(state: WizardState): NewProjectInput | null {
  const { features, terrain, parameters, baseline } = state;
  const name = state.name.trim();
  if (
    features === null ||
    terrain === null ||
    parameters === null ||
    baseline === null ||
    name === ''
  ) {
    return null;
  }
  const split = withoutZones(baseline);
  return {
    name,
    parcel: parcelFrom(features, name),
    heightmapRef: terrain.heightmapRef,
    parameters,
    baselineDocument: split.document,
    zones: split.zones,
    closesAt: state.closesAt === '' ? null : state.closesAt,
  };
}
