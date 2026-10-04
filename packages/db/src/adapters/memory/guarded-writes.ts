import { projectPhase, type Clock } from '@parkshape/core';

import type { CreateDraftResult, DraftSource, NewDraft } from '../../ports/guarded-writes.js';
import type { JsonObject } from '../../ports/records.js';
import { MissingReferenceError } from '../../ports/repositories.js';

import type { InMemoryStore } from './store.js';

/*
 * The in-memory twins of the Postgres guarded writes. Every function here runs with no await, so
 * the phase read and the write it guards happen in one turn of the event loop, which is what the
 * share lock on the project row buys in Postgres.
 */

/** Whether the project is open on the injected clock now; false for a missing project. */
export function projectOpenNow(store: InMemoryStore, projectId: string, clock: Clock): boolean {
  const project = store.projects.get(projectId);
  return project !== undefined && projectPhase(project, clock.now()) === 'open';
}

export interface DraftContent {
  readonly document: JsonObject;
  readonly title: string;
  readonly forkedFrom: string | null;
}

type Refusal = Extract<
  CreateDraftResult,
  { kind: 'phase-closed' | 'source-not-live' | 'no-baseline' }
>;

function sourceContent(
  store: InMemoryStore,
  projectId: string,
  source: DraftSource,
): DraftContent | Refusal {
  if (source.from === 'document') return { ...source, forkedFrom: null };
  if (source.from === 'fork') {
    const live = store.designs.get(source.designId);
    if (live?.projectId !== projectId || live.status !== 'submitted') {
      return { kind: 'source-not-live' };
    }
    return { document: live.document, title: live.title, forkedFrom: live.id };
  }
  const baselineId = store.projects.get(projectId)?.baselineDesignId ?? null;
  const baseline = baselineId === null ? undefined : store.designs.get(baselineId);
  if (baseline === undefined) return { kind: 'no-baseline' };
  return { document: baseline.document, title: baseline.title, forkedFrom: null };
}

/** The content a new draft copies, or why it cannot be made now; throws on a missing reference. */
export function draftContent(
  store: InMemoryStore,
  clock: Clock,
  input: NewDraft,
): DraftContent | Refusal {
  if (!store.projects.has(input.projectId)) {
    throw new MissingReferenceError(`project ${input.projectId}`);
  }
  if (!store.users.has(input.authorId)) {
    throw new MissingReferenceError(`user ${input.authorId}`);
  }
  if (!projectOpenNow(store, input.projectId, clock)) return { kind: 'phase-closed' };
  return sourceContent(store, input.projectId, input.source);
}
