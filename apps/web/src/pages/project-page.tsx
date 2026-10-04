import { useMemo } from 'react';
import { useLoaderData } from 'react-router';

import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';
import { documentPropertyReader, readPalette } from '@parkshape/scene/plan';
import { ButtonLink, Inline, PageTitle, Stack } from '@parkshape/ui';

import type { Design, Project } from '../api/web-api';
import { drawPlan } from '../features/vote/plan-drawing';
import { posterFor } from '../features/vote/poster-source';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { pluralise } from '../plural';
import { PATHS } from '../routing/paths';

import { projectFacts } from './project-facts';

const TEXT_LINKS = [
  { key: 'gallery', href: PATHS.gallery },
  { key: 'leaderboard', href: PATHS.leaderboard },
] as const;

interface ProjectData {
  readonly project: Project;
  readonly designCount: number;
  readonly baseline: Design | null;
}

/** The staff brief as residents read it, under its own label. */
function ProjectBrief({ brief }: { readonly brief: string }) {
  const text = brief.trim();
  if (text === '') return null;
  return (
    <section className="web-project__brief" aria-labelledby="project-brief">
      <h2 id="project-brief" className="web-project__brief-heading">
        {messages.project.brief}
      </h2>
      <p data-kind="data">{text}</p>
    </section>
  );
}

/** The fact line: park size, place and deadline, the design count, then the text links. */
function ProjectFacts({ project, designCount }: Omit<ProjectData, 'baseline'>) {
  const text = messages.project;
  return (
    <div className="web-project__facts">
      <p>{projectFacts(project)}</p>
      <p>{designCount === 0 ? text.noDesigns : pluralise(designCount, text.designCount)}</p>
      <p className="web-project__links">
        {TEXT_LINKS.map(({ key, href }) => (
          <a key={key} href={href(project.id)}>
            {text[key]}
          </a>
        ))}
      </p>
    </div>
  );
}

/** The park today: its thumbnail, or a flat plan drawn from it; null when neither exists. */
function useBaselinePicture(baseline: Design | null, project: Project): string | null {
  return useMemo(() => {
    const palette = readPalette(documentPropertyReader());
    return (
      posterFor({ summary: baseline, full: baseline, project, palette, drawPlan })?.thumbnailUrl ??
      null
    );
  }, [baseline, project]);
}

/** The park as it is today, at reading width. */
function BaselinePicture({ src, name }: { readonly src: string | null; readonly name: string }) {
  if (src === null) return null;
  return (
    <img
      className="web-project__today"
      src={src}
      alt={format(messages.project.baselineAlt, { name })}
      width={THUMBNAIL_WIDTH_PX}
      height={THUMBNAIL_HEIGHT_PX}
    />
  );
}

/**
 * The project page: the fact line, what the planners ask for, the park today, then Start a
 * design as the one filled button and Vote on designs beside it.
 */
export function ProjectPage() {
  const { project, designCount, baseline } = useLoaderData<ProjectData>();
  const picture = useBaselinePicture(baseline, project);
  const { meta } = messages;
  useDocumentMeta({
    title: format(meta.project.title, { name: project.name }),
    description: format(meta.project.description, { name: project.name }),
    image: baseline?.thumbnailUrl ?? null,
  });
  return (
    <Stack gap="large" className="web-page">
      <PageTitle>{project.name}</PageTitle>
      <ProjectFacts project={project} designCount={designCount} />
      <ProjectBrief brief={project.parameters.brief} />
      <BaselinePicture src={picture} name={project.name} />
      <Inline gap="small">
        {project.phase === 'open' ? (
          <ButtonLink href={PATHS.newDesign(project.id)}>{messages.project.startDesign}</ButtonLink>
        ) : null}
        <ButtonLink variant="secondary" href={PATHS.vote(project.id)}>
          {messages.project.vote}
        </ButtonLink>
      </Inline>
    </Stack>
  );
}
