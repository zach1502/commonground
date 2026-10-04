import { parcelSchema, type DesignDocument } from '@parkshape/core';
import { assetManifestFromModels } from '@parkshape/scene/editor';
import { renderThumbnail, viewerScene, type OfflineFrame } from '@parkshape/scene/thumbnail';

import { heightmapFromPayload } from './payload.js';

// Only the aria label matters in an offscreen canvas; the text never shows in the PNG.
const STRINGS = {
  canvasLabel: 'Seed thumbnail',
  viewControls: 'View',
  resetView: 'Reset view',
  topDown: 'Top-down',
  birdsEye: "Bird's eye",
  compareWithToday: 'Compare with today',
  loadingMessage: 'Loading',
};
const MODELS_INDEX = '/models/index.json';

declare global {
  interface Window {
    seedThumbnail?: (
      document: DesignDocument,
      parcel: unknown,
      terrain: unknown,
      frame: OfflineFrame,
    ) => Promise<string>;
  }
}

async function manifest() {
  const response = await fetch(MODELS_INDEX);
  return assetManifestFromModels(response.ok ? await response.json() : null, '/');
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

const models = await manifest();

// The seed tool calls this through Playwright once per design, on the project's recorded terrain,
// with the offline preset the hero uses.
window.seedThumbnail = async (document, parcel, terrain, frame) => {
  const scene = viewerScene(document, parcelSchema.parse(parcel), heightmapFromPayload(terrain));
  const blob = await renderThumbnail({ ...scene, strings: STRINGS, manifest: models }, frame);
  return base64Of(blob);
};
