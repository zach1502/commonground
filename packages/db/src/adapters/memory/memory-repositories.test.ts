import { designRepositoryContract } from '../../ports/__contracts__/design-repository.contract.js';
import { elementCommentRepositoryContract } from '../../ports/__contracts__/element-comment-repository.contract.js';
import type { RepositoriesFactory } from '../../ports/__contracts__/fixtures.js';
import { guardedWritesContract } from '../../ports/__contracts__/guarded-writes.contract.js';
import { orderingAndReferencesContract } from '../../ports/__contracts__/ordering-and-references.contract.js';
import { projectRepositoryContract } from '../../ports/__contracts__/project-repository.contract.js';
import { userRepositoryContract } from '../../ports/__contracts__/user-repository.contract.js';
import { voteRepositoryContract } from '../../ports/__contracts__/vote-repository.contract.js';

import {
  InMemoryDesignRepository,
  InMemoryElementCommentRepository,
  InMemoryProjectRepository,
  InMemoryStore,
  InMemoryUserRepository,
  InMemoryVoteRepository,
  createInMemoryRepositories,
} from './index.js';

const explicit: RepositoriesFactory = (deps) => {
  const store = new InMemoryStore();
  return Promise.resolve({
    users: new InMemoryUserRepository(store, deps),
    projects: new InMemoryProjectRepository(store, deps),
    designs: new InMemoryDesignRepository(store, deps),
    votes: new InMemoryVoteRepository(store, deps),
    elementComments: new InMemoryElementCommentRepository(store, deps),
  });
};

userRepositoryContract('InMemoryUserRepository', explicit);
projectRepositoryContract('InMemoryProjectRepository', explicit);
designRepositoryContract('InMemoryDesignRepository', explicit);
voteRepositoryContract('InMemoryVoteRepository', explicit);
guardedWritesContract('InMemory repositories', explicit);
orderingAndReferencesContract('InMemory repositories', explicit);
designRepositoryContract('createInMemoryRepositories', (deps) =>
  Promise.resolve(createInMemoryRepositories(deps)),
);

elementCommentRepositoryContract('InMemoryElementCommentRepository', explicit);
elementCommentRepositoryContract('createInMemoryRepositories', (deps) =>
  Promise.resolve(createInMemoryRepositories(deps)),
);
