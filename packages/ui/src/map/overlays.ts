import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';

import { boundsOf, type LonLat, type MapFeatureCollection } from './map-style.js';

export type OverlayId = 'outline' | 'draft' | 'markers';

const OVERLAYS: readonly OverlayId[] = ['outline', 'draft', 'markers'];
const EMPTY: MapFeatureCollection = { type: 'FeatureCollection', features: [] };
const OUTLINE_FILL_OPACITY = 0.2;
const LINE_WIDTH_PX = 2;
const DASH_LENGTH = 2;
const DASH_GAP = 1;
const DRAFT_DASH = [DASH_LENGTH, DASH_GAP];
const VERTEX_RADIUS_PX = 5;
const MARKER_RADIUS_PX = 6;
const MARKER_STROKE_PX = 2;
const FIT_PADDING_PX = 32;

/** Map colours, read from the design tokens at runtime because MapLibre needs real values. */
export interface MapColours {
  readonly outline: string;
  readonly locked: string;
  readonly unlocked: string;
  readonly halo: string;
}

const TOKENS: Readonly<Record<keyof MapColours, string>> = {
  outline: '--status-info',
  locked: '--domain-soil-dark',
  unlocked: '--domain-terrain-grass',
  halo: '--surface-color-background-white',
};

/** Reads one token's value from the page; gray when the stylesheet is missing, as in tests. */
export function tokenReader(element: Element): (token: string) => string {
  const style = getComputedStyle(element);
  return (token) => style.getPropertyValue(token).trim() || 'gray';
}

export function readColours(element: Element): MapColours {
  const read = tokenReader(element);
  return {
    outline: read(TOKENS.outline),
    locked: read(TOKENS.locked),
    unlocked: read(TOKENS.unlocked),
    halo: read(TOKENS.halo),
  };
}

/** Adds the empty overlay sources and their layers on top of the basemap. */
export function addOverlays(map: MaplibreMap, colours: MapColours): void {
  OVERLAYS.forEach((id) => {
    map.addSource(id, { type: 'geojson', data: EMPTY });
  });
  map.addLayer({
    id: 'outline-fill',
    type: 'fill',
    source: 'outline',
    paint: { 'fill-color': colours.outline, 'fill-opacity': OUTLINE_FILL_OPACITY },
  });
  map.addLayer({
    id: 'outline-line',
    type: 'line',
    source: 'outline',
    paint: { 'line-color': colours.outline, 'line-width': LINE_WIDTH_PX },
  });
  map.addLayer({
    id: 'draft-line',
    type: 'line',
    source: 'draft',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': colours.outline,
      'line-width': LINE_WIDTH_PX,
      'line-dasharray': DRAFT_DASH,
    },
  });
  map.addLayer({
    id: 'draft-vertices',
    type: 'circle',
    source: 'draft',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': colours.outline, 'circle-radius': VERTEX_RADIUS_PX },
  });
  map.addLayer({
    id: 'markers',
    type: 'circle',
    source: 'markers',
    paint: {
      'circle-radius': MARKER_RADIUS_PX,
      'circle-color': ['match', ['get', 'locked'], 'locked', colours.locked, colours.unlocked],
      'circle-stroke-color': colours.halo,
      'circle-stroke-width': MARKER_STROKE_PX,
    },
  });
}

/** What the component needs from a loaded map, without MapLibre types leaking out. */
export interface MapHandle {
  setOverlay(id: OverlayId, data: MapFeatureCollection): void;
  fitTo(ring: readonly LonLat[]): void;
}

export function handleFor(map: MaplibreMap): MapHandle {
  return {
    setOverlay(id, data) {
      const source = map.getSource<GeoJSONSource>(id);
      void source?.setData(data as Parameters<GeoJSONSource['setData']>[0]);
    },
    fitTo(ring) {
      if (ring.length === 0) return;
      map.fitBounds(boundsOf(ring), { padding: FIT_PADDING_PX, animate: false });
    },
  };
}
