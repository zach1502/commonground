import { useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '@parkshape/api-client';
import { designDocumentSchema, type DesignDocument } from '@parkshape/core';

import { failureKind } from '../api/link-failure';
import type { Design, WebApi } from '../api/web-api';

import { createAutosave, type Autosave, type SaveFailure, type SaveStatus } from './autosave';
import type { EditorSession } from './editor-session';

/** The server kept a newer save of this draft, so this one was not stored. */
class DraftChangedError extends Error {
  constructor() {
    super('The draft was saved elsewhere.');
    this.name = 'DraftChangedError';
  }
}

const UNAUTHORIZED = 401;

/** HTTP 401: the session ended, so the save was refused and the draft is kept for sign-in. */
function isSignedOut(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === UNAUTHORIZED;
}

/** Sorts a save error into a lost link, a refusal, a signed-out session, or an elsewhere save. */
export const classifySaveFailure = (error: unknown): SaveFailure => {
  if (error instanceof DraftChangedError) return 'conflict';
  if (isSignedOut(error)) return 'signedOut';
  return failureKind(error) === 'link' ? 'paused' : 'failed';
};

export interface AutosaveInput {
  readonly session: EditorSession | null;
  readonly api: Pick<WebApi, 'saveDraft'>;
  readonly design: Pick<Design, 'id' | 'title' | 'blurb'>;
}

export interface DraftSaves {
  readonly status: SaveStatus;
  /** The version saved in another tab or on another device, until the reader chooses. */
  readonly conflict: Design | null;
  /** Overwrites the other version with this tab's document. */
  readonly keepMine: () => void;
  /** Replaces this tab's document with the other version. */
  readonly useSaved: () => void;
  /** Saves the editor's document now, after any save in flight; answers with the status. */
  readonly saveNow: () => Promise<SaveStatus>;
}

/**
 * Saves each change after a short pause, one save at a time, each with the stamp the last one
 * returned. A lost link pauses saving: the change stays on this device and goes out when the
 * browser is back online. A save the server refuses because the draft was saved elsewhere stops
 * saving until the reader keeps their changes or takes the saved version.
 */
export function useAutosave({ session, api, design }: AutosaveInput): DraftSaves {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [conflict, setConflict] = useState<Design | null>(null);
  const autosave = useRef<Autosave<DesignDocument> | null>(null);
  const adopted = useRef<DesignDocument | null>(null);
  const { id, title, blurb } = design;
  useEffect(() => {
    if (session === null) return undefined;
    const { store } = session.ctx;
    const saves = createAutosave({
      save: async (document: DesignDocument) => {
        const expectedUpdatedAt = session.expectedUpdatedAt();
        const outcome = await api.saveDraft(id, { title, blurb, document, expectedUpdatedAt });
        if (outcome.kind === 'changed') {
          setConflict(outcome.current);
          throw new DraftChangedError();
        }
        session.markSaved({ sent: document, stored: outcome.design });
      },
      onStatus: setStatus,
      classify: classifySaveFailure,
    });
    autosave.current = saves;
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.document === previous.document || state.document === adopted.current) return;
      saves.schedule(state.document);
    });
    const retry = () => void saves.retry();
    window.addEventListener('online', retry);
    if (session.sync === 'push') saves.schedule(store.getState().document);
    return () => {
      unsubscribe();
      window.removeEventListener('online', retry);
      // Leaving never prompts; a change still waiting for its save goes out now.
      void saves.flush();
    };
  }, [session, api, id, title, blurb]);
  return useDraftChoices({ session, autosave, adopted, status, conflict, setConflict });
}

interface ChoiceInput {
  readonly session: EditorSession | null;
  readonly autosave: { readonly current: Autosave<DesignDocument> | null };
  readonly adopted: { current: DesignDocument | null };
  readonly status: SaveStatus;
  readonly conflict: Design | null;
  readonly setConflict: (next: Design | null) => void;
}

function useDraftChoices(input: ChoiceInput): DraftSaves {
  const { session, autosave, adopted, conflict, setConflict } = input;
  const current = () => session?.ctx.store.getState().document;
  return {
    status: input.status,
    conflict,
    keepMine: () => {
      const document = current();
      if (session === null || conflict === null || document === undefined) return;
      session.keepMine(conflict);
      setConflict(null);
      autosave.current?.schedule(document);
      void autosave.current?.resolve('keep');
    },
    useSaved: () => {
      if (session === null || conflict === null) return;
      const document = designDocumentSchema.parse(conflict.document);
      void autosave.current?.resolve('discard');
      adopted.current = document;
      session.useSaved({ document, updatedAt: conflict.updatedAt });
      setConflict(null);
    },
    saveNow: async () => {
      const document = current();
      const saves = autosave.current;
      if (document === undefined || saves === null) return 'failed';
      saves.schedule(document);
      return saves.flush();
    },
  };
}
