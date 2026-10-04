// Vite bundles the MapLibre worker with its shared chunk and hands back its URL, so the map
// works from the app's own origin in dev and in the production build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/** Loads MapLibre on first use, so pages without a map never download it. */
export async function loadMaplibre() {
  const maplibre = await import('maplibre-gl');
  maplibre.setWorkerUrl(workerUrl);
  return maplibre;
}
