import { useLoaderData } from 'react-router';

import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';
import {
  Badge,
  ButtonLink,
  EmptyState,
  keysSharedByAll,
  PageTitle,
  useSetReveal,
} from '@parkshape/ui';

import type { DesignSummary, Project } from '../api/web-api';
import { factLine } from '../design/design-facts';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { PATHS } from '../routing/paths';

interface GalleryData {
  readonly project: Project;
  readonly designs: readonly DesignSummary[];
}

interface CardProps {
  readonly design: DesignSummary;
  readonly hiddenBadges: ReadonlySet<string>;
}

function DesignCard({ design, hiddenBadges }: CardProps) {
  const text = messages.gallery;
  const badges = design.badges.filter((badge) => !hiddenBadges.has(badge.key));
  const facts = factLine(design.metrics?.totals ?? null);
  return (
    <li className="web-gallery__card">
      <a
        className="web-gallery__link"
        href={PATHS.designView(design.id)}
        aria-label={format(text.cardLabel, { title: design.title })}
      >
        {design.thumbnailUrl === null ? (
          <span className="web-gallery__thumb web-gallery__thumb--none" aria-hidden="true" />
        ) : (
          <img
            className="web-gallery__thumb"
            src={design.thumbnailUrl}
            alt={format(text.thumbnailAlt, { title: design.title })}
            width={THUMBNAIL_WIDTH_PX}
            height={THUMBNAIL_HEIGHT_PX}
          />
        )}
        <h2 className="web-gallery__title" data-kind="data">
          {design.title}
        </h2>
        {badges.length === 0 ? null : (
          <ul className="web-gallery__badges" data-kind="data">
            {badges.map((badge) => (
              <li key={badge.key}>
                <Badge tone="warning">{badge.badge}</Badge>
              </li>
            ))}
          </ul>
        )}
      </a>
      {facts === null ? null : (
        <p className="web-gallery__facts" data-kind="data">
          {facts}
        </p>
      )}
    </li>
  );
}

/**
 * The gallery: submitted design thumbnails, newest first. Cards are allowed here, and each takes
 * the height of its content. A badge that every card carries is hidden.
 */
export function GalleryPage() {
  const { project, designs } = useLoaderData<GalleryData>();
  const text = messages.gallery;
  const hidden = keysSharedByAll(designs.map((design) => design.badges));
  useDocumentMeta({
    title: format(messages.meta.gallery.title, { name: project.name }),
    description: format(messages.meta.gallery.description, { name: project.name }),
    image: designs[0]?.thumbnailUrl ?? null,
  });
  const count = designs.length;
  const closed = project.phase === 'closed';
  const grid = useSetReveal<HTMLUListElement>(designs.map((design) => design.id).join(' '));
  return (
    <div className="web-page web-gallery">
      <div className="web-gallery__head">
        <PageTitle context={project.name}>{text.heading}</PageTitle>
        {count === 0 ? null : <ButtonLink href={PATHS.vote(project.id)}>{text.vote}</ButtonLink>}
      </div>
      {count === 0 ? (
        <EmptyState
          text={closed ? text.closed : text.empty}
          action={
            closed
              ? { href: PATHS.leaderboard(project.id), label: messages.leaderboard.heading }
              : { href: PATHS.newDesign(project.id), label: text.emptyAction }
          }
        />
      ) : (
        <>
          <ul ref={grid} className="web-gallery__grid">
            {designs.map((design) => (
              <DesignCard key={design.id} design={design} hiddenBadges={hidden} />
            ))}
          </ul>
          <div className="web-gallery__end">
            <ButtonLink variant="secondary" href={PATHS.vote(project.id)}>
              {text.vote}
            </ButtonLink>
          </div>
        </>
      )}
    </div>
  );
}
