import type { ProjectStatusChange, ProjectStatusResult } from './guarded-writes.js';
import type { JsonObject, Project, ProjectStatus } from './records.js';

export interface NewProject {
  readonly name: string;
  /** The staff member creating it; one author cannot hold two projects with one name. */
  readonly authorId: string;
  readonly parameters: JsonObject;
  readonly parcel: JsonObject;
  readonly heightmapRef: string;
  /** ISO date; left out or null means the project stays open until staff close it. */
  readonly closesAt?: string | null;
}

/**
 * A new project, or the id of the author's project that already has the name. Names compare
 * without case, so a double-submitted wizard or a retried request cannot make a second copy.
 */
export type CreateProjectResult =
  | { readonly kind: 'created'; readonly project: Project }
  | { readonly kind: 'name-taken'; readonly existingId: string };

/** Parks open for design, in creation order. */
export interface ProjectRepository {
  create(input: NewProject): Promise<CreateProjectResult>;
  findById(id: string): Promise<Project | undefined>;
  list(): Promise<Project[]>;
  setStatus(id: string, status: ProjectStatus): Promise<Project | undefined>;
  setClosesAt(id: string, closesAt: string | null): Promise<Project | undefined>;
  /**
   * Sets the status, and the closing day when given, in one write that matches only when it
   * changes something; `unchanged` when the project already had them.
   */
  changeStatus(id: string, change: ProjectStatusChange): Promise<ProjectStatusResult>;
  setBaselineDesign(id: string, designId: string): Promise<Project | undefined>;
}
