import { Link, useFetcher, useLoaderData } from 'react-router';

import { Button, ButtonLink, EmptyState, PageTitle, Stack } from '@parkshape/ui';

import type { Project } from '../api/web-api';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { StatusBody, StatusError } from '../routing/actions';
import { PATHS } from '../routing/paths';
import { stepHref } from '../staff/wizard-steps';

const strings = messages.planner.home;

function ProjectRow({ project }: { readonly project: Project }) {
  const fetcher = useFetcher<StatusError>();
  const next = project.status === 'open' ? 'closed' : 'open';
  const body: StatusBody = { id: project.id, status: next };
  const failed = fetcher.data?.error === 'status-failed';
  return (
    <li className="web-list__item web-list__item--staff">
      <Link to={PATHS.gallery(project.id)} className="web-list__link">
        {project.name}
      </Link>
      <span className="web-list__status">{messages.projects.status[project.status]}</span>
      <Link to={PATHS.insights(project.id)} className="web-list__insights">
        {format(strings.insights, { name: project.name })}
      </Link>
      <span className="web-list__action">
        <Button
          variant="secondary"
          size="small"
          isPending={fetcher.state !== 'idle'}
          onPress={() => {
            void fetcher.submit({ ...body }, { method: 'post', encType: 'application/json' });
          }}
        >
          {format(project.status === 'open' ? strings.close : strings.reopen, {
            name: project.name,
          })}
        </Button>
      </span>
      {failed ? (
        <p role="alert" className="web-list__error">
          {format(strings.failed, { name: project.name })}
        </p>
      ) : null}
    </li>
  );
}

/** Staff home: each project on a fixed row with its status, Insights and Close, and New project. */
export function StaffHomePage() {
  const { projects } = useLoaderData<{ projects: Project[] }>();
  useDocumentMeta(messages.meta.staff);
  return (
    <Stack gap="large" className="web-page">
      <PageTitle lede={messages.staff.lede}>{messages.staff.heading}</PageTitle>
      <div>
        <ButtonLink href={stepHref('site')}>{strings.newProject}</ButtonLink>
      </div>
      {projects.length === 0 ? (
        <EmptyState text={messages.staff.empty} />
      ) : (
        <ul className="web-list web-list--staff">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </Stack>
  );
}
