import type { Clock } from '@parkshape/core';

/** A JSON object as stored in a jsonb column; the API parses it with its zod schema. */
export type JsonObject = Readonly<Record<string, unknown>>;

export type UserRole = 'resident' | 'staff';
export type ProjectStatus = 'open' | 'closed';
export type DesignStatus = 'draft' | 'submitted' | 'superseded';
export type VoteValue = -1 | 1;

export interface User {
  readonly id: string;
  readonly role: UserRole;
  readonly displayName: string;
  readonly selfReport: JsonObject | null;
  readonly createdAt: Date;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  /** The staff member who created it; null only on rows made before authors were recorded. */
  readonly authorId: string | null;
  readonly status: ProjectStatus;
  readonly parameters: JsonObject;
  readonly parcel: JsonObject;
  readonly heightmapRef: string;
  readonly baselineDesignId: string | null;
  /** The last day of design and voting as an ISO date, or null for no set day. */
  readonly closesAt: string | null;
  readonly createdAt: Date;
}

export interface Design {
  readonly id: string;
  readonly projectId: string;
  readonly authorId: string;
  readonly title: string;
  readonly blurb: string;
  readonly document: JsonObject;
  // Null until submit, when the server computes and stores the metrics.
  readonly metrics: JsonObject | null;
  readonly status: DesignStatus;
  readonly forkedFrom: string | null;
  readonly versionOf: string | null;
  readonly thumbnailRef: string | null;
  readonly up: number;
  readonly down: number;
  readonly createdAt: Date;
  /**
   * The server's stamp for the last save of the title, blurb or document. Every save moves it
   * forward, even within one millisecond, so a matching stamp means nobody saved in between.
   */
  readonly updatedAt: Date;
  readonly submittedAt: Date | null;
}

/** A design without its document: what lists, the leaderboard and vote checks read. */
export type DesignSummary = Omit<Design, 'document'>;

/** What the review queue draws from: enough to pick a batch, and nothing to present it. */
export type QueueCandidate = Pick<Design, 'id' | 'authorId' | 'up' | 'down'>;

/** What a vote checks: the design without its document, and its project's phase and baseline. */
export interface VoteTarget {
  readonly design: DesignSummary;
  readonly project: Pick<Project, 'id' | 'status' | 'closesAt' | 'baselineDesignId'>;
}

export interface Vote {
  readonly id: string;
  readonly userId: string;
  readonly designId: string;
  readonly value: VoteValue;
  readonly reasons: readonly string[];
  /** The voter's own words, already trimmed and checked by the API, or null for none. */
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Clock and id source shared by every repository adapter, so tests stay deterministic. */
export interface RepositoryDeps {
  readonly clock: Clock;
  readonly newId: () => string;
}
