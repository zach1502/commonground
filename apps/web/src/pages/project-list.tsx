import { Link } from 'react-router';

import { Badge, EmptyState } from '@parkshape/ui';

import type { Project } from '../api/web-api';
import { messages } from '../messages';
import { PATHS } from '../routing/paths';

import { projectMeta } from './project-deadline';

export interface ProjectListProps {
  readonly projects: readonly Project[];
  /** Designs per project, in the same order as `projects`. */
  readonly designCounts: readonly number[];
  readonly emptyText: string;
}

/**
 * Projects as a plain list of links, each with its design count. Open is the usual state, so
 * only a closed project carries a badge.
 */
export function ProjectList({ projects, designCounts, emptyText }: ProjectListProps) {
  if (projects.length === 0) {
    return <EmptyState text={emptyText} />;
  }
  return (
    <ul className="web-list">
      {projects.map((project, index) => (
        <li key={project.id} className="web-list__item">
          <Link to={PATHS.project(project.id)} className="web-list__link">
            {project.name}
          </Link>
          <p className="web-list__meta" data-kind="data">
            {projectMeta(project, designCounts[index] ?? 0)}
          </p>
          {project.phase === 'closed' ? (
            <Badge tone="neutral">{messages.projects.status.closed}</Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
