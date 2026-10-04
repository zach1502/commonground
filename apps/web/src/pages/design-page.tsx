import { lazy, Suspense, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useLoaderData, useLocation, useNavigate } from 'react-router';

import type { Design, Project, User } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { arrivalFrom } from '../design/arrival';
import { DesignDetails } from '../design/design-details';
import { sceneTierFor } from '../design/scene-tier';
import { parcelDepthRatio } from '../design/stage-aspect';
import { useVoteCounts } from '../design/vote-counts';
import { warmDesignModels } from '../design/warm-models';
import { YourVote } from '../design/your-vote';
import { ReviewEntry, reviewIsPrimary } from '../features/review/review-entry';
import { itemLabels } from '../features/review/review-model';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { PATHS } from '../routing/paths';

const ViewerPanel = lazy(async () => ({
  default: (await import('../design/viewer-panel')).ViewerPanel,
}));

interface DesignData {
  readonly user: User | null;
  readonly design: Design;
  readonly project: Project;
}

/** The read-only design page: the 3D viewer, a legend, tap-to-inspect and share. */
export function DesignPage({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'editor'> }) {
  const { user, design, project } = useLoaderData<DesignData>();
  const navigate = useNavigate();
  const arrival = arrivalFrom(useLocation().state);
  const counts = useVoteCounts(design);
  const walkLabels = useMemo(() => itemLabels(design, project), [design, project]);
  useDocumentMeta({
    title: format(messages.meta.design.title, { title: design.title }),
    description: format(messages.meta.design.description, { name: project.name }),
    image: design.thumbnailUrl,
  });
  useEffect(() => {
    warmDesignModels(design.document);
  }, [design.document]);
  const makeVersion = async () => {
    const draft = await deps.api.makeVersion(design.id);
    await navigate(PATHS.design(project.id, draft.id));
  };
  return (
    <div className="web-design">
      <div
        className="web-design__stage"
        style={{ '--design-stage-depth': parcelDepthRatio(project.parcel) } as CSSProperties}
      >
        <Suspense fallback={<p className="web-empty">{messages.designPage.loading}</p>}>
          <ViewerPanel
            design={design}
            project={project}
            api={deps.api}
            tier={sceneTierFor(deps.editor.testHook)}
            testHook={deps.editor.testHook}
            walk={{ labels: walkLabels }}
            streets={{ api: deps.api, names: 'shown' }}
          />
        </Suspense>
      </div>
      <DesignDetails
        design={counts.shown}
        project={project}
        user={user}
        onMakeVersion={() => void makeVersion()}
        arrival={arrival}
        review={<ReviewEntry design={design} project={project} />}
        vote={
          <YourVote
            api={deps.api}
            design={design}
            user={user}
            onCounts={counts.update}
            emphasis={reviewIsPrimary({ design, project }) ? 'review' : 'vote'}
          />
        }
      />
    </div>
  );
}
