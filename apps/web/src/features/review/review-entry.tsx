import { ButtonLink } from '@parkshape/ui';

import type { Design, Project } from '../../api/web-api';
import { messages } from '../../messages';
import { PATHS } from '../../routing/paths';

export interface ReviewEntryProps {
  readonly design: Pick<Design, 'id' | 'status'>;
  readonly project: Pick<Project, 'phase'>;
}

/** Whether the design page leads with Review this design: submitted, while the project is open. */
export function reviewIsPrimary({ design, project }: ReviewEntryProps): boolean {
  return design.status === 'submitted' && project.phase === 'open';
}

/**
 * The way into review mode from the design page. It is the page's one primary action while the
 * project is open; once closed, comments stay readable behind a secondary See comments.
 */
export function ReviewEntry(props: ReviewEntryProps) {
  const { design } = props;
  if (design.status === 'draft') return null;
  const href = PATHS.review(design.id);
  if (reviewIsPrimary(props)) return <ButtonLink href={href}>{messages.review.action}</ButtonLink>;
  return (
    <ButtonLink href={href} variant="secondary">
      {messages.review.seeComments}
    </ButtonLink>
  );
}
