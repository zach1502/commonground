import type { DesignDocument, Heightmap, Parcel } from '@parkshape/core';
import type { AssetManifest } from '@parkshape/scene/plan';
import type { OfflineFrame } from '@parkshape/scene/thumbnail';

import { viewerStrings } from '../viewer-strings';

export interface PictureInput {
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  /** The project's recorded ground; absent draws the flat parcel. */
  readonly terrain?: Heightmap | undefined;
  /** 'thumbnail' for a design card, 'baseline' for the large project page picture. */
  readonly frame: OfflineFrame;
  readonly manifest?: AssetManifest | undefined;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('read failed'));
    };
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * Draws one still picture with the offline preset the seed uses, and returns it as base64 for
 * the thumbnail route. three.js loads only when a picture is drawn.
 */
export async function renderPicture(input: PictureInput): Promise<string> {
  const { renderThumbnail, viewerScene } = await import('@parkshape/scene/thumbnail');
  const scene = viewerScene(input.document, input.parcel, input.terrain);
  const blob = await renderThumbnail(
    {
      heightmap: scene.heightmap,
      document: scene.document,
      catalog: scene.catalog,
      strings: viewerStrings(),
      ...(input.manifest === undefined ? {} : { manifest: input.manifest }),
    },
    input.frame,
  );
  return blobToBase64(blob);
}
