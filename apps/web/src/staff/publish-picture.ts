import { parcelSchema, type DesignDocument } from '@parkshape/core';
import type { AssetManifest } from '@parkshape/scene/plan';

import type { Project, WebApi } from '../api/web-api';
import { renderPicture, type PictureInput } from '../design/render-picture';

export type PictureRenderer = (input: PictureInput) => Promise<string>;

export type PictureOutcome = 'stored' | 'skipped' | 'failed';

/**
 * The longest publish waits for the baseline picture. A lost WebGL context can leave the render
 * pending for good; past this the project is open with no picture, and the planner can retry.
 */
export const PICTURE_TIMEOUT_MS = 20_000;

/** The render, or a rejection once the bound passes. */
function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('The baseline picture took too long.'));
    }, PICTURE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export interface BaselinePictureInput {
  readonly api: Pick<WebApi, 'getTerrain' | 'saveThumbnail'>;
  readonly project: Project;
  /** The baseline document the wizard sent, the park as it is today. */
  readonly baseline: DesignDocument;
  readonly manifest?: AssetManifest | undefined;
  /** Draws the picture; tests pass a fake, since jsdom has no WebGL. */
  readonly render?: PictureRenderer;
}

/**
 * Draws the new project's baseline picture on its recorded terrain with the preset the seed
 * uses, and stores it as the baseline design's thumbnail, which the project page shows. A
 * failed or stuck picture never blocks publishing: the project stays open with no picture.
 */
export async function publishBaselinePicture(input: BaselinePictureInput): Promise<PictureOutcome> {
  const { api, project } = input;
  const designId = project.baselineDesignId;
  if (designId === null) return 'skipped';
  try {
    const terrain = await api.getTerrain(project.id).catch(() => undefined);
    const image = await bounded(
      (input.render ?? renderPicture)({
        document: input.baseline,
        parcel: parcelSchema.parse(project.parcel),
        terrain,
        frame: 'baseline',
        manifest: input.manifest,
      }),
    );
    await api.saveThumbnail(designId, image);
    return 'stored';
  } catch {
    return 'failed';
  }
}
