import { CATALOG_THUMBNAIL_SETTINGS, renderCatalogThumbnail } from '@parkshape/scene/thumbnail';

declare global {
  interface Window {
    catalogThumbnailSettings?: unknown;
    catalogThumbnail?: (modelKey: string, url: string) => Promise<string>;
  }
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

// The thumbnails command reads the settings for its manifest hash, then calls this once per
// catalog item through Playwright.
window.catalogThumbnailSettings = CATALOG_THUMBNAIL_SETTINGS;
window.catalogThumbnail = async (modelKey, url) =>
  base64Of(await renderCatalogThumbnail(modelKey, url));
