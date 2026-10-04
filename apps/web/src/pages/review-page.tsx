import { lazy, Suspense, useMemo } from 'react';
import { useLoaderData } from 'react-router';

import type { ReviewLayerProps } from '@parkshape/scene/viewer';

import type { Design, Project, User } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { sceneTierFor } from '../design/scene-tier';
import { itemLabels } from '../features/review/review-model';
import { ReviewWorkspace } from '../features/review/review-workspace';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';

const ViewerPanel = lazy(async () => ({
  default: (await import('../design/viewer-panel')).ViewerPanel,
}));

interface ReviewData {
  readonly user: User | null;
  readonly design: Design;
  readonly project: Project;
}

/** /designs/:designId/review: comment on the elements of a submitted design, or read them. */
export function ReviewPage({
  deps,
}: {
  readonly deps: Pick<WebDeps, 'api' | 'editor' | 'review' | 'clock'>;
}) {
  const { user, design, project } = useLoaderData<ReviewData>();
  const labels = useMemo(() => itemLabels(design, project), [design, project]);
  useDocumentMeta({
    title: format(messages.review.meta.title, { title: design.title }),
    description: format(messages.review.meta.description, { name: project.name }),
    image: design.thumbnailUrl,
  });
  const stage = (review: ReviewLayerProps) => (
    <Suspense fallback={<p className="web-empty">{messages.designPage.loading}</p>}>
      <ViewerPanel
        design={design}
        project={project}
        api={deps.api}
        tier={sceneTierFor(deps.editor.testHook)}
        testHook={deps.editor.testHook}
        review={review}
        walk={{ labels }}
      />
    </Suspense>
  );
  return (
    <ReviewWorkspace
      design={design}
      project={project}
      user={user}
      api={deps.review}
      clock={deps.clock}
      stage={stage}
    />
  );
}
