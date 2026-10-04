import { useLoaderData } from 'react-router';

import { PageTitle, Stack } from '@parkshape/ui';

import type { Project } from '../api/web-api';
import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';

import { ProjectList } from './project-list';

export function ProjectsPage() {
  const { projects, designCounts } = useLoaderData<{
    projects: Project[];
    designCounts: number[];
  }>();
  useDocumentMeta(messages.meta.projects);
  return (
    <Stack gap="large" className="web-page">
      <PageTitle>{messages.projects.heading}</PageTitle>
      <ProjectList
        projects={projects}
        designCounts={designCounts}
        emptyText={messages.projects.empty}
      />
    </Stack>
  );
}
