import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MaplibreMap, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { Button } from '../button.js';
import type { MapTileSource } from '../ports/map-tile-source.js';

import { loadMaplibre } from './load-maplibre.js';
import {
  closeRing,
  draftCollection,
  markerCollection,
  outlineCollection,
  resolveTokens,
  toMaplibreStyle,
  type LonLat,
  type MapMarker,
} from './map-style.js';
import { addOverlays, handleFor, readColours, tokenReader, type MapHandle } from './overlays.js';

// Mount Pleasant, Vancouver, before a park is chosen.
const DEFAULT_LON = -123.1;
const DEFAULT_LAT = 49.263;
const DEFAULT_CENTRE: [number, number] = [DEFAULT_LON, DEFAULT_LAT];
const DEFAULT_ZOOM = 14;
const MIN_CORNERS = 3;

export interface ParcelMapStrings {
  readonly region: string;
  readonly finish: string;
  readonly clear: string;
  readonly drawHint: string;
  readonly loading: string;
}

export interface ParcelMapProps {
  readonly tiles: MapTileSource;
  readonly strings: ParcelMapStrings;
  /** The parcel outline to show, or null before one is known. */
  readonly outline: readonly LonLat[] | null;
  readonly markers?: readonly MapMarker[];
  /** 'on' shows the click-to-add-corner tool with Finish and Clear. */
  readonly draw?: 'on' | 'off';
  readonly onFinishDrawing?: (ring: LonLat[]) => void;
}

type ClickHandler = (lonLat: LonLat) => void;

/** Creates the MapLibre map once per tile source and hands back a handle once it has loaded. */
function useMaplibre(
  container: RefObject<HTMLDivElement | null>,
  tiles: MapTileSource,
  onClick: ClickHandler,
): MapHandle | null {
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    const element = container.current;
    if (element === null) return undefined;
    let map: MaplibreMap | undefined;
    let cancelled = false;
    void loadMaplibre().then((maplibre) => {
      if (cancelled) return;
      const created = new maplibre.Map({
        container: element,
        style: toMaplibreStyle(
          resolveTokens(tiles.styleOrTiles(), tokenReader(element)),
        ) as StyleSpecification,
        center: DEFAULT_CENTRE,
        zoom: DEFAULT_ZOOM,
      });
      map = created;
      created.on('click', (event) => {
        clickRef.current([event.lngLat.lng, event.lngLat.lat]);
      });
      created.on('load', () => {
        addOverlays(created, readColours(element));
        setHandle(handleFor(created));
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
      setHandle(null);
    };
  }, [container, tiles]);
  return handle;
}

function useOverlays(handle: MapHandle | null, props: ParcelMapProps, draft: readonly LonLat[]) {
  const { outline, markers } = props;
  useEffect(() => {
    if (handle === null) return;
    handle.setOverlay('outline', outlineCollection(outline));
    if (outline !== null) handle.fitTo(outline);
  }, [handle, outline]);
  useEffect(() => {
    handle?.setOverlay('markers', markerCollection(markers ?? []));
  }, [handle, markers]);
  useEffect(() => {
    handle?.setOverlay('draft', draftCollection(draft));
  }, [handle, draft]);
}

interface DrawToolsProps {
  readonly strings: ParcelMapStrings;
  readonly corners: number;
  readonly onFinish: () => void;
  readonly onClear: () => void;
}

function DrawTools({ strings, corners, onFinish, onClear }: DrawToolsProps) {
  return (
    <div className="ps-parcel-map__tools">
      <p className="ps-parcel-map__hint">{strings.drawHint}</p>
      <Button
        variant="secondary"
        size="small"
        isDisabled={corners < MIN_CORNERS}
        onPress={onFinish}
      >
        {strings.finish}
      </Button>
      <Button variant="tertiary" size="small" isDisabled={corners === 0} onPress={onClear}>
        {strings.clear}
      </Button>
    </div>
  );
}

/** A MapLibre map of the parcel: its outline, feature markers, and an optional outline tool. */
export function ParcelMap(props: ParcelMapProps) {
  const { tiles, strings, draw = 'off', onFinishDrawing } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<readonly LonLat[]>([]);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const onClick = useCallback<ClickHandler>((lonLat) => {
    if (drawRef.current === 'on') setDraft((corners) => [...corners, lonLat]);
  }, []);
  const handle = useMaplibre(container, tiles, onClick);
  useOverlays(handle, props, draw === 'on' ? draft : []);
  return (
    <div className="ps-parcel-map">
      <div
        ref={container}
        role="region"
        aria-label={strings.region}
        aria-busy={handle === null ? 'true' : 'false'}
        data-map={handle === null ? 'loading' : 'ready'}
        className="ps-parcel-map__canvas"
      />
      {handle === null ? <p className="ps-parcel-map__loading">{strings.loading}</p> : null}
      {draw === 'on' ? (
        <DrawTools
          strings={strings}
          corners={draft.length}
          onFinish={() => {
            onFinishDrawing?.(closeRing(draft));
            setDraft([]);
          }}
          onClear={() => {
            setDraft([]);
          }}
        />
      ) : null}
    </div>
  );
}
