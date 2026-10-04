import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { ParkViewer, type ParkViewerProps } from '../components/ParkViewer.js';
import { VIEW_CHANGE_MS } from '../motion/rise.js';
import { offlineRender, type OfflineFrame, type OfflineRender } from '../perf/render-preset.js';

/** Thrown when the offscreen canvas never produced an image. */
export class ThumbnailRenderError extends Error {
  readonly kind = 'thumbnail-render-failed';

  constructor(message: string) {
    super(message);
    this.name = 'ThumbnailRenderError';
  }
}

/**
 * The viewer inputs needed to draw one design. The mode, callbacks, tier and drawing buffer come
 * from the offline preset, so every still image is drawn the same way.
 */
export type ThumbnailInput = Omit<
  ParkViewerProps,
  'mode' | 'onReady' | 'onFrameTime' | 'drawingBuffer' | 'tier'
>;

// The desktop tier in software WebGL draws AO and a 2048 px shadow map on the CPU, so a large
// frame can take a few seconds to load and settle.
const READY_TIMEOUT_MS = 30_000;
// Frames drawn after the scene reports ready. One can still be the empty first frame on a slow
// software renderer, so the capture waits for two.
const MIN_FRAMES_AFTER_READY = 2;
const WEBP_QUALITY = 0.8;

/** An off-screen box of the given pixel size for a canvas that is drawn but never shown. */
export function detachedHost(width: number, height: number): HTMLDivElement {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${String(width)}px`;
  container.style.height = `${String(height)}px`;
  document.body.append(container);
  return container;
}

const detachedContainer = (frame: OfflineRender) => detachedHost(frame.width, frame.height);

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/** WebP at 0.8, or PNG when asked or where the canvas cannot encode WebP (it hands back a PNG). */
async function encode(canvas: HTMLCanvasElement, frame: OfflineRender): Promise<Blob> {
  if (frame.encoding === 'image/webp') {
    const webp = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (webp?.type === 'image/webp') return webp;
  }
  const png = await canvasBlob(canvas, 'image/png');
  if (png === null) throw new ThumbnailRenderError('The canvas produced no image.');
  return png;
}

/**
 * Tracks the scene until it is safe to read: loaded, then at least two frames drawn and enough
 * frame time for the island to finish rising into place.
 */
function readiness() {
  let ready = false;
  let frames = 0;
  let drawnMs = 0;
  let settled: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const check = () => {
    if (ready && frames >= MIN_FRAMES_AFTER_READY && drawnMs >= VIEW_CHANGE_MS) settled();
  };
  const onReady = () => {
    ready = true;
    check();
  };
  const onFrameTime = (frameMs: number) => {
    if (!ready) return;
    frames += 1;
    drawnMs += frameMs;
    check();
  };
  return { done, onReady, onFrameTime };
}

export function withTimeout(done: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ThumbnailRenderError('The thumbnail did not render in time.'));
    }, READY_TIMEOUT_MS);
  });
  return Promise.race([done, late]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Renders one design with the viewer into a detached canvas sized for the frame (a 640x400
 * thumbnail by default) and returns its image. Every frame uses the offline preset: the desktop
 * tier with shadows, detail maps and the composer. The frame probe keeps the loop drawing until
 * capture. The render runs only in a real browser, so it is covered by Playwright.
 */
export async function renderThumbnail(
  input: ThumbnailInput,
  frameName: OfflineFrame = 'thumbnail',
): Promise<Blob> {
  const frame = offlineRender(frameName);
  const container = detachedContainer(frame);
  const root = createRoot(container);
  try {
    const scene = readiness();
    // Only offline canvases keep their drawing buffer, so the encoder reads the drawn frame.
    root.render(
      createElement(ParkViewer, {
        ...input,
        mode: 'view',
        onReady: scene.onReady,
        onFrameTime: scene.onFrameTime,
        tier: frame.preset.tier,
        drawingBuffer: frame.preset.drawingBuffer,
      }),
    );
    await withTimeout(scene.done);
    const canvas = container.querySelector('canvas');
    if (canvas === null) {
      throw new ThumbnailRenderError('The viewer produced no canvas.');
    }
    return await encode(canvas, frame);
  } finally {
    root.unmount();
    container.remove();
  }
}
