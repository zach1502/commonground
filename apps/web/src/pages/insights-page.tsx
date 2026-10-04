import { useMemo } from 'react';
import { useLoaderData } from 'react-router';

import { designDocumentSchema } from '@parkshape/core';
import { CountedAt, PageTitle } from '@parkshape/ui';

import type { WebDeps } from '../app-deps';
import { sceneTierFor } from '../design/scene-tier';
import { CommentsFold } from '../features/insights/comments-fold';
import {
  ElementFeedbackSection,
  useFeedbackApi,
} from '../features/insights/element-feedback-section';
import { EngagementSection, ExportLinks } from '../features/insights/exports-engagement';
import { HeatmapPanel } from '../features/insights/heatmap-panel';
import {
  BaselineFold,
  EarthworksFold,
  ReasonsByDesignFold,
} from '../features/insights/insights-folds';
import {
  ComplianceSection,
  FeatureCharts,
  HeadlineNumbers,
  ReasonsSection,
} from '../features/insights/insights-sections';
import { SummarySection } from '../features/insights/summary-section';
import { useInsights } from '../features/insights/use-insights';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { InsightsData } from '../routing/insights-loader';

const text = messages.insights;

/**
 * Staff insights in the planner's order: the counts, the summary, the heatmap, the feature and
 * reason bars and the rules, then the detail tables folded away, the exports and who took part.
 */
export function InsightsPage({
  deps,
}: {
  readonly deps: Pick<
    WebDeps,
    'api' | 'feedback' | 'review' | 'pollIntervalMs' | 'apiBaseUrl' | 'clock' | 'editor'
  >;
}) {
  const loaded = useLoaderData<InsightsData>();
  const { project, insights: initial, summary, terrain } = loaded;
  const baseline = useMemo(
    () => (loaded.baseline === null ? null : designDocumentSchema.parse(loaded.baseline)),
    [loaded.baseline],
  );
  useDocumentMeta({
    title: text.meta.title,
    description: format(text.meta.description, { name: project.name }),
    image: null,
  });
  const insights = useInsights(deps.api, project.id, initial, deps.pollIntervalMs);
  // A new insights object means a fresh count, so the time moves with it.
  const countedAt = useMemo(() => deps.clock.now(), [deps.clock, insights]);
  const feedbackApi = useFeedbackApi(deps);
  return (
    <div className="web-page web-insights">
      <PageTitle context={project.name} lede={text.lede}>
        {text.heading}
      </PageTitle>
      <HeadlineNumbers headline={insights.headline} />
      <CountedAt template={text.countedAt} at={countedAt} />
      <SummarySection summary={summary} />
      <HeatmapPanel
        project={project}
        baseline={baseline}
        terrain={terrain}
        heatmaps={insights.heatmaps}
        designs={insights.headline.designsSubmitted}
        tier={sceneTierFor(deps.editor.testHook)}
        session={deps.editor.storage.session}
      />
      <FeatureCharts features={insights.features} designs={insights.headline.designsSubmitted} />
      <ReasonsSection reasons={insights.reasons} votes={insights.headline.votesCast} />
      <ComplianceSection compliance={insights.compliance} />
      <ReasonsByDesignFold reasons={insights.reasons} />
      <CommentsFold comments={insights.comments} />
      <ElementFeedbackSection project={project} api={feedbackApi} apiBaseUrl={deps.apiBaseUrl} />
      <BaselineFold diff={insights.baselineDiff} />
      <EarthworksFold earthworks={insights.earthworks} />
      <ExportLinks apiBaseUrl={deps.apiBaseUrl} projectId={project.id} />
      <EngagementSection engagement={insights.engagement} />
    </div>
  );
}
