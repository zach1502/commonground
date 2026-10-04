import type { Design, JsonObject, Project, ProjectStatus } from './records.js';

/*
 * Writes that must land while their project is open. Each adapter reads the project inside the
 * write itself (Postgres: `SELECT ... FOR SHARE` on the project row, in the write's transaction
 * or statement), so a close that commits after the service's own phase check still stops it.
 *
 * One clock decides the closing day: the injected Clock in RepositoryDeps, read when the write
 * runs. The database clock is never used, so tests move time with FakeClock and every instance
 * agrees with the service's own check.
 */

/** Where a new draft's content comes from. Fork and baseline are copied inside the write. */
export type DraftSource =
  | { readonly from: 'document'; readonly document: JsonObject; readonly title: string }
  | { readonly from: 'fork'; readonly designId: string }
  | { readonly from: 'baseline' };

export interface NewDraft {
  readonly projectId: string;
  readonly authorId: string;
  /** Replaces the source's title when given. */
  readonly title?: string | undefined;
  readonly source: DraftSource;
}

/**
 * `source-not-live`: the fork source is not a live design of this project when the copy runs.
 * `no-baseline`: the project has no baseline when the copy runs.
 */
export type CreateDraftResult =
  | { readonly kind: 'created'; readonly design: Design }
  | { readonly kind: 'phase-closed' }
  | { readonly kind: 'source-not-live' }
  | { readonly kind: 'no-baseline' };

/** `not-submitted`: the design is missing, still a draft, or already superseded. */
export type CreateVersionResult =
  | { readonly kind: 'created'; readonly design: Design }
  | { readonly kind: 'phase-closed' }
  | { readonly kind: 'not-submitted' };

export interface ThumbnailAttach {
  readonly thumbnailRef: string;
  /** The design's `updatedAt` as the caller read it; the picture is of that version. */
  readonly expectedUpdatedAt: Date;
}

/** `changed`: a save moved the stamp, so the picture shows a document the design no longer has. */
export type ThumbnailResult =
  | { readonly kind: 'attached'; readonly design: Design }
  | { readonly kind: 'missing' }
  | { readonly kind: 'changed' };

/** A status change, and a new closing day when `closesAt` is not undefined. */
export interface ProjectStatusChange {
  readonly status: ProjectStatus;
  readonly closesAt?: string | null | undefined;
}

/** `unchanged`: the project already had this status and closing day when the write ran. */
export type ProjectStatusResult =
  | { readonly kind: 'changed'; readonly project: Project }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'missing' };
