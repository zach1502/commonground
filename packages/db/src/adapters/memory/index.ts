import type { RepositoryDeps } from '../../ports/records.js';
import type { Repositories } from '../../ports/repositories.js';

import { InMemoryDesignRepository } from './design-repository.js';
import { InMemoryElementCommentRepository } from './element-comment-repository.js';
import { InMemoryStore } from './store.js';
import { InMemoryProjectRepository, InMemoryUserRepository } from './user-project-repositories.js';
import { InMemoryVoteRepository } from './vote-repository.js';

export {
  InMemoryDesignRepository,
  InMemoryElementCommentRepository,
  InMemoryProjectRepository,
  InMemoryStore,
  InMemoryUserRepository,
  InMemoryVoteRepository,
};

/** Every repository over one fresh in-memory store. */
export function createInMemoryRepositories(deps: RepositoryDeps): Repositories {
  const store = new InMemoryStore();
  return {
    users: new InMemoryUserRepository(store, deps),
    projects: new InMemoryProjectRepository(store, deps),
    designs: new InMemoryDesignRepository(store, deps),
    votes: new InMemoryVoteRepository(store, deps),
    elementComments: new InMemoryElementCommentRepository(store, deps),
  };
}
