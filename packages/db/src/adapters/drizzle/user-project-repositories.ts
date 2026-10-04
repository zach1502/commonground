import { and, asc, eq, ne, or, sql } from 'drizzle-orm';

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

import type { DrizzleDb } from './pglite.js';
import { projects, users } from './schema/index.js';

export class DrizzleUserRepository implements UserRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly deps: RepositoryDeps,
  ) {}

  async upsert(input: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({ ...input, createdAt: this.deps.clock.now() })
      .onConflictDoUpdate({
        target: users.id,
        set: { role: input.role, displayName: input.displayName },
      })
      .returning();
    return firstRow(user, 'users upsert');
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async setSelfReport(id: string, selfReport: JsonObject): Promise<User | undefined> {
    const [user] = await this.db
      .update(users)
      .set({ selfReport })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly deps: RepositoryDeps,
  ) {}

  /**
   * One insert that does nothing on a conflict. Postgres waits for a parallel insert of the same
   * author and name to commit before it decides, so exactly one of two such creates makes a row.
   */
  async create(input: NewProject): Promise<CreateProjectResult> {
    const [project] = await this.db
      .insert(projects)
      .values({
        ...input,
        closesAt: input.closesAt ?? null,
        id: this.deps.newId(),
        status: 'open',
        createdAt: this.deps.clock.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (project !== undefined) return { kind: 'created', project };
    const [taken] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.authorId, input.authorId),
          sql`lower(${projects.name}) = lower(${input.name})`,
        ),
      );
    return { kind: 'name-taken', existingId: firstRow(taken, 'projects name lookup').id };
  }

  async findById(id: string): Promise<Project | undefined> {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  list(): Promise<Project[]> {
    return this.db.select().from(projects).orderBy(asc(projects.createdAt), asc(projects.id));
  }

  async setStatus(id: string, status: ProjectStatus): Promise<Project | undefined> {
    const [project] = await this.db
      .update(projects)
      .set({ status })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async setClosesAt(id: string, closesAt: string | null): Promise<Project | undefined> {
    const [project] = await this.db
      .update(projects)
      .set({ closesAt })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  /**
   * One conditional UPDATE. Two staff changes that read the same row both reach it; the second
   * waits for the first's row lock, then re-checks the WHERE against the committed row and
   * matches nothing, so it answers `unchanged` instead of writing the same change twice.
   */
  changeStatus(id: string, change: ProjectStatusChange): Promise<ProjectStatusResult> {
    const { status, closesAt } = change;
    const differs =
      closesAt === undefined
        ? ne(projects.status, status)
        : or(
            ne(projects.status, status),
            sql`${projects.closesAt} is distinct from ${closesAt}::date`,
          );
    const set = closesAt === undefined ? { status } : { status, closesAt };
    return this.db.transaction(async (tx): Promise<ProjectStatusResult> => {
      const [project] = await tx
        .update(projects)
        .set(set)
        .where(and(eq(projects.id, id), differs))
        .returning();
      if (project !== undefined) return { kind: 'changed', project };
      const [found] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, id));
      return found === undefined ? { kind: 'missing' } : { kind: 'unchanged' };
    });
  }

  async setBaselineDesign(id: string, designId: string): Promise<Project | undefined> {
    const [project] = await this.db
      .update(projects)
      .set({ baselineDesignId: designId })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }
}

/** The single row an INSERT ... RETURNING must produce. */
export function firstRow<T>(row: T | undefined, statement: string): T {
  if (row === undefined) {
    throw new Error(`${statement} returned no row`);
  }
  return row;
}
