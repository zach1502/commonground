import type { Project } from '@parkshape/db';

import type { AppDeps } from '../deps.js';
import { notFound, wrongStatus } from '../errors.js';

export interface StatusChange {
  readonly status: Project['status'];
  /** A new closing day, null to clear it, or undefined to keep the one stored. */
  readonly closesAt?: string | null | undefined;
}

/**
 * Applies PATCH /projects/:id/status. Setting the status it already has is a conflict unless the
 * same request moves the closing day, which is how staff reopen a project whose day has passed.
 * The repository decides both in its one write, so two changes that read the same project
 * cannot both succeed, and a refused reopen leaves the closing day as it was.
 */
export async function applyStatusChange(
  deps: Pick<AppDeps, 'repos'>,
  current: Project,
  change: StatusChange,
): Promise<Project> {
  const result = await deps.repos.projects.changeStatus(current.id, change);
  if (result.kind === 'missing') {
    throw notFound('Project');
  }
  if (result.kind === 'unchanged') {
    throw wrongStatus(`The project is already ${change.status}.`);
  }
  return result.project;
}
