import { useState } from 'react';
import { useNavigate } from 'react-router';

import { parcelSchema } from '@parkshape/core';
import type { AssetManifest, EditorContext } from '@parkshape/scene/editor';

import type { Design, Project, SubmitOutcome, WebApi } from '../api/web-api';
import { SUBMITTED_ARRIVAL } from '../design/arrival';
import { renderPicture } from '../design/render-picture';
import { PATHS } from '../routing/paths';

import type { DraftSaves } from './use-autosave';

/** What submitting reads from the editor page. */
export interface SubmitProps {
  readonly project: Pick<Project, 'parcel'>;
  readonly design: Pick<Design, 'id'>;
  readonly deps: { readonly api: Pick<WebApi, 'saveThumbnail' | 'submitDesign'> };
}

async function captureThumbnail(
  props: SubmitProps,
  ctx: EditorContext,
  manifest: AssetManifest | undefined,
): Promise<void> {
  try {
    const image = await renderPicture({
      document: ctx.store.getState().document,
      parcel: parcelSchema.parse(props.project.parcel),
      terrain: ctx.baseHeightmap,
      frame: 'thumbnail',
      manifest,
    });
    await props.deps.api.saveThumbnail(props.design.id, image);
  } catch {
    // A missing thumbnail never blocks a submit; the gallery falls back to a title-only card.
  }
}

export function useSubmitDialog(
  ctx: EditorContext | null,
  props: SubmitProps,
  manifest: AssetManifest | undefined,
  saves: Pick<DraftSaves, 'saveNow'>,
) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The submit goes through the same conditional save as autosave, so it never overwrites a
  // version saved elsewhere; a conflict fails the submit and the bar shows the choice.
  const runSubmit = async (): Promise<SubmitOutcome> => {
    if (ctx === null) throw new Error('The editor is not ready.');
    const status = await saves.saveNow();
    if (status !== 'saved') throw new Error(`The draft did not save (${status}).`);
    return props.deps.api.submitDesign(props.design.id);
  };
  const onSuccess = async () => {
    if (ctx !== null) await captureThumbnail(props, ctx, manifest);
    await navigate(PATHS.designView(props.design.id), { state: SUBMITTED_ARRIVAL });
  };
  return { open, setOpen, runSubmit, onSuccess };
}
