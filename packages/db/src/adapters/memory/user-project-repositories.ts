import type { ProjectStatusChange, ProjectStatusResult } from '../../ports/guarded-writes.js';
import type {
  CreateProjectResult,
  NewProject,
  ProjectRepository,
} from '../../ports/project-repository.js';
import type {
  JsonObject,
  Project,
  ProjectStatus,
  RepositoryDeps,
  User,
} from '../../ports/records.js';
import type { UpsertUser, UserRepository } from '../../ports/user-repository.js';

import { byDateThenId, type InMemoryStore } from './store.js';

export class InMemoryUserRepository implements UserRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly deps: RepositoryDeps,
  ) {}

  upsert(input: UpsertUser): Promise<User> {
    const existing = this.store.users.get(input.id);
    const user: User = {
      selfReport: null,
      createdAt: this.deps.clock.now(),
      ...existing,
      ...input,
    };
    this.store.users.set(user.id, user);
    return Promise.resolve(user);
  }

  findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.store.users.get(id));
  }

  setSelfReport(id: string, selfReport: JsonObject): Promise<User | undefined> {
    const existing = this.store.users.get(id);
    if (existing === undefined) return Promise.resolve(undefined);
    const user: User = { ...existing, selfReport: { ...selfReport } };
    this.store.users.set(id, user);
    return Promise.resolve(user);
  }
}

export class InMemoryProjectRepository implements ProjectRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly deps: RepositoryDeps,
  ) {}

  create(input: NewProject): Promise<CreateProjectResult> {
    const taken = this.sameName(input);
    if (taken !== undefined) {
      return Promise.resolve({ kind: 'name-taken', existingId: taken.id });
    }
    const project: Project = {
      ...input,
      closesAt: input.closesAt ?? null,
      id: this.deps.newId(),
      status: 'open',
      baselineDesignId: null,
      createdAt: this.deps.clock.now(),
    };
    this.store.projects.set(project.id, project);
    return Promise.resolve({ kind: 'created', project });
  }

  /** Mirrors the projects_author_name_idx unique index: one author, one name, any case. */
  private sameName(input: NewProject): Project | undefined {
    const name = input.name.toLowerCase();
    return [...this.store.projects.values()].find(
      (project) => project.authorId === input.authorId && project.name.toLowerCase() === name,
    );
  }

  findById(id: string): Promise<Project | undefined> {
    return Promise.resolve(this.store.projects.get(id));
  }

  list(): Promise<Project[]> {
    const projects = [...this.store.projects.values()];
    return Promise.resolve(projects.sort(byDateThenId((project) => project.createdAt, 'asc')));
  }

  setStatus(id: string, status: ProjectStatus): Promise<Project | undefined> {
    return Promise.resolve(this.patch(id, { status }));
  }

  setClosesAt(id: string, closesAt: string | null): Promise<Project | undefined> {
    return Promise.resolve(this.patch(id, { closesAt }));
  }

  changeStatus(id: string, change: ProjectStatusChange): Promise<ProjectStatusResult> {
    const existing = this.store.projects.get(id);
    if (existing === undefined) return Promise.resolve({ kind: 'missing' });
    const closesAt = change.closesAt === undefined ? existing.closesAt : change.closesAt;
    if (existing.status === change.status && existing.closesAt === closesAt) {
      return Promise.resolve({ kind: 'unchanged' });
    }
    const project = { ...existing, status: change.status, closesAt };
    this.store.projects.set(id, project);
    return Promise.resolve({ kind: 'changed', project });
  }

  setBaselineDesign(id: string, designId: string): Promise<Project | undefined> {
    return Promise.resolve(this.patch(id, { baselineDesignId: designId }));
  }

  private patch(id: string, changes: Partial<Project>): Project | undefined {
    const existing = this.store.projects.get(id);
    if (existing === undefined) {
      return undefined;
    }
    const project = { ...existing, ...changes };
    this.store.projects.set(id, project);
    return project;
  }
}
