import type { JsonObject, User, UserRole } from './records.js';

export interface UpsertUser {
  readonly id: string;
  readonly role: UserRole;
  readonly displayName: string;
}

/** People who have signed in at least once. */
export interface UserRepository {
  /** Creates the user or refreshes role and name; keeps createdAt and selfReport. */
  upsert(input: UpsertUser): Promise<User>;
  findById(id: string): Promise<User | undefined>;
  /** Replaces the user's self report; undefined when there is no such user. */
  setSelfReport(id: string, selfReport: JsonObject): Promise<User | undefined>;
}
