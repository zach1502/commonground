import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import {
  canvasBlob,
  detachedHost,
  ThumbnailRenderError,
  withTimeout,
} from '../thumbnail/render-thumbnail.js';

import { CatalogThumbnailCanvas } from './CatalogThumbnail.js';
import { CATALOG_THUMBNAIL_SETTINGS } from './framing.js';

/**
 * Draws one catalog model into a detached 256 px square canvas and returns it as a transparent
 * PNG. It runs only in a real browser, driven by the asset pipeline's thumbnails command.
 */
export async function renderCatalogThumbnail(modelKey: string, url: string): Promise<Blob> {
  const side = CATALOG_THUMBNAIL_SETTINGS.sizePx;
  const container = detachedHost(side, side);
  const root = createRoot(container);
  try {
    let onReady: () => void = () => undefined;
    const drawn = new Promise<void>((resolve) => {
      onReady = resolve;
    });
    root.render(createElement(CatalogThumbnailCanvas, { modelKey, url, onReady }));
    await withTimeout(drawn);
    const canvas = container.querySelector('canvas');
    if (canvas === null) throw new ThumbnailRenderError('The catalog picture has no canvas.');
    const png = await canvasBlob(canvas, 'image/png');
    if (png === null) throw new ThumbnailRenderError('The canvas produced no image.');
    return png;
  } finally {
    root.unmount();
    container.remove();
  }
}
