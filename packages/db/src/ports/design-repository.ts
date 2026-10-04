import type {
  CreateDraftResult,
  CreateVersionResult,
  NewDraft,
  ThumbnailAttach,
  ThumbnailResult,
} from './guarded-writes.js';
import type {
  Design,
  DesignStatus,
  DesignSummary,
  JsonObject,
  QueueCandidate,
  VoteTarget,
} from './records.js';

export interface NewDesign {
  readonly projectId: string;
  readonly authorId: string;
  readonly title: string;
  readonly blurb: string;
  readonly document: JsonObject;
  readonly forkedFrom: string | null;
}

export interface DraftChanges {
  readonly title: string;
  readonly blurb: string;
  readonly document: JsonObject;
  /**
   * The `updatedAt` the caller last read. When given, the save goes through only if the stored
   * stamp still equals it; the stamps are compared for equality, never for order.
   */
  readonly expectedUpdatedAt?: Date;
}

/** What a draft save did: the saved draft, why it stayed as it was, or the newer stored copy. */
export type DraftSaveResult =
  | { readonly kind: 'saved'; readonly design: Design }
  | { readonly kind: 'not-draft' }
  | { readonly kind: 'phase-closed' }
  | { readonly kind: 'changed'; readonly current: Design };

export interface SubmitInput {
  readonly metrics: JsonObject;
  /**
   * The document the metrics were computed from, as it was read. The submit fails with `changed`
   * when a save replaced the stored document in the meantime, so metrics never outlive it.
   */
  readonly document: JsonObject;
  /** Most live designs one author may have in the project; the submit that would pass it fails. */
  readonly liveCap: number;
}

/** What a submit did: the live design, or why the draft stayed a draft. */
export type SubmitResult =
  | { readonly kind: 'submitted'; readonly design: Design }
  | { readonly kind: 'not-draft' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'live-cap-reached'; readonly live: number }
  | { readonly kind: 'phase-closed' };

/** Park designs from draft through submitted to superseded. */
export interface DesignRepository {
  /** Inserts a draft as given, with no phase check: staff baselines and fixtures. */
  create(input: NewDesign): Promise<Design>;
  /**
   * A resident's new draft. The project must be open and a fork or baseline source is copied in
   * the same write, so the copy is the source as it stood when the draft was made.
   */
  createDraft(input: NewDraft): Promise<CreateDraftResult>;
  findById(id: string): Promise<Design | undefined>;
  /**
   * Updates a draft and moves its stamp. `not-draft` when the design is missing or not a draft;
   * `phase-closed` when the project is closed; `changed` with the stored draft when
   * `expectedUpdatedAt` no longer matches.
   */
  updateDraft(id: string, changes: DraftChanges): Promise<DraftSaveResult>;
  /**
   * Stores the server metrics and stamps submittedAt; drafts only. The live count and the status
   * change are one atomic step, so parallel submits by one author cannot pass the cap together.
   * The project must be open when the write runs, or the result is `phase-closed`.
   */
  submit(id: string, input: SubmitInput): Promise<SubmitResult>;
  /**
   * Copies a submitted design into a new draft and marks the source superseded, atomically, while
   * the project is open. Votes stay on the source.
   */
  createVersion(sourceId: string): Promise<CreateVersionResult>;
  /** The draft that was versioned from this design, if one exists; the lineage successor. */
  findVersionOf(sourceId: string): Promise<Design | undefined>;
  /** Records the thumbnail blob key if the design still has the stamp the picture was taken at. */
  setThumbnail(id: string, input: ThumbnailAttach): Promise<ThumbnailResult>;
  /** Designs in a project with the given status, newest submission first. */
  listByProject(projectId: string, status: DesignStatus): Promise<Design[]>;
  /** listByProject without the documents, which are most of each row's size. */
  listSummariesByProject(projectId: string, status: DesignStatus): Promise<DesignSummary[]>;
  findSummaryById(id: string): Promise<DesignSummary | undefined>;
  /** The project's live designs in list order, with only what the queue needs to pick. */
  listQueueCandidates(projectId: string): Promise<QueueCandidate[]>;
  /** Summaries in the order of the ids given; an unknown id is left out. */
  findSummariesByIds(ids: readonly string[]): Promise<DesignSummary[]>;
  /** The design summary and its project's phase in one read, for the vote route. */
  findVoteTarget(id: string): Promise<VoteTarget | undefined>;
  countByAuthor(projectId: string, authorId: string, status: DesignStatus): Promise<number>;
}
