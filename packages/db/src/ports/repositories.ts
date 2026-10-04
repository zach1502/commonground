import type { DesignRepository } from './design-repository.js';
import type { ElementCommentRepository } from './element-comment-repository.js';
import type { ProjectRepository } from './project-repository.js';
import type { UserRepository } from './user-repository.js';
import type { VoteRepository } from './vote-repository.js';

/** Every repository over one store, so votes can update design counters in place. */
export interface Repositories {
  readonly users: UserRepository;
  readonly projects: ProjectRepository;
  readonly designs: DesignRepository;
  readonly votes: VoteRepository;
  readonly elementComments: ElementCommentRepository;
}

/** Thrown when a write names a user, project or design that does not exist. */
export class MissingReferenceError extends Error {
  readonly kind = 'missing-reference';

  constructor(readonly reference: string) {
    super(`Missing ${reference}`);
    this.name = 'MissingReferenceError';
  }
}

/**
 * Thrown when a vote or a resident's comment reaches the database after its project closed, by
 * staff or by date.
 */
export class PhaseClosedError extends Error {
  readonly kind = 'phase-closed';

  constructor(readonly reference: string) {
    super(`The project of ${reference} is closed`);
    this.name = 'PhaseClosedError';
  }
}
