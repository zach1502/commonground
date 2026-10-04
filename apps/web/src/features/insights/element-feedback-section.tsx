import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiUrl } from '@parkshape/api-client';
import {
  designDocumentSchema,
  parcelSchema,
  type DesignDocument,
  type Parcel,
} from '@parkshape/core';
import { documentPropertyReader, planPosterUrl, readPalette } from '@parkshape/scene/plan';
import { DownloadLink } from '@parkshape/ui';

import type { Project } from '../../api/web-api';
import type { WebDeps } from '../../app-deps';
import { format, messages } from '../../messages';

import {
  activeTitle,
  commentMarks,
  type ElementComments,
  type FeedbackApi,
} from './element-feedback-model';
import {
  CommentMap,
  CountTable,
  commentKindRows,
  elementKindRows,
  PlannerComment,
  type ModerationActions,
} from './element-feedback-parts';

const text = messages.insights.feedback;

export interface ElementFeedbackSectionProps {
  readonly project: Project;
  readonly api: FeedbackApi;
  readonly apiBaseUrl: string;
}

type Feedback = Awaited<ReturnType<FeedbackApi['elementFeedback']>>;

interface Picked {
  readonly groups: readonly ElementComments[];
  readonly document: DesignDocument;
}

/** The counts per design, the picked design's comments and drawing, and a refresh after a write. */
function useFeedback(api: FeedbackApi, projectId: string) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [failed, setFailed] = useState<'ok' | 'failed'>('ok');
  const designId = chosen ?? feedback?.designs[0]?.designId;
  const load = useCallback(async () => {
    try {
      setFeedback(await api.elementFeedback(projectId));
    } catch {
      setFailed('failed');
    }
  }, [api, projectId]);
  const loadDesign = useCallback(async () => {
    if (designId === undefined) return;
    try {
      const [listed, design] = await Promise.all([
        api.listComments(designId),
        api.getDesign(designId),
      ]);
      setPicked({ groups: listed.elements, document: designDocumentSchema.parse(design.document) });
    } catch {
      setFailed('failed');
    }
  }, [api, designId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadDesign();
  }, [loadDesign]);
  const refresh = async () => {
    await Promise.all([load(), loadDesign()]);
  };
  return { feedback, designId, setChosen, picked, failed, refresh };
}

function titleLine(groups: readonly ElementComments[]): string | null {
  const best = activeTitle(groups);
  if (best === undefined) return null;
  const kind = messages.review.kind[best.kind].toLowerCase();
  const template = best.count === 1 ? text.active.one : text.active.other;
  return format(template, { label: best.label, count: best.count, kind });
}

function DesignPicker(props: {
  readonly feedback: Feedback;
  readonly designId: string | undefined;
  readonly onPick: (designId: string) => void;
}) {
  return (
    <label className="web-feedback__picker">
      {text.picker}
      <select
        value={props.designId}
        onChange={(event) => {
          props.onPick(event.target.value);
        }}
      >
        {props.feedback.designs.map((design) => (
          <option key={design.designId} value={design.designId}>
            {format(design.total === 1 ? text.option.one : text.option.other, {
              title: design.title,
              count: design.total,
            })}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommentGroups(props: {
  readonly groups: readonly ElementComments[];
  readonly actions: ModerationActions;
}) {
  return (
    <section className="web-feedback__groups" aria-label={text.list}>
      {props.groups.map((group) => (
        <div key={group.elementId} className="web-feedback__group">
          <h4 data-kind="data">{group.label}</h4>
          {group.comments.map((comment) => (
            <PlannerComment key={comment.id} comment={comment} actions={props.actions} />
          ))}
        </div>
      ))}
    </section>
  );
}

/** The deps the section needs, as one object of plain functions. */
export function useFeedbackApi(deps: Pick<WebDeps, 'api' | 'feedback' | 'review'>): FeedbackApi {
  const { api, feedback, review } = deps;
  return useMemo(
    () => ({
      ...feedback,
      listComments: review.listComments,
      getDesign: (designId: string) => api.getDesign(designId),
    }),
    [api, feedback, review],
  );
}

function usePoster(picked: Picked | null, parcel: Parcel): string | null {
  return useMemo(() => {
    if (picked === null) return null;
    const palette = readPalette(documentPropertyReader());
    return planPosterUrl({ document: picked.document, parcel, palette });
  }, [picked, parcel]);
}

function moderation(api: FeedbackApi, refresh: () => Promise<void>): ModerationActions {
  return {
    resolve: async (commentId, reply) => {
      await api.resolveComment(commentId, reply === '' ? undefined : reply);
      await refresh();
    },
    setHidden: async (commentId, hidden) => {
      await api.hideComment(commentId, { hidden });
      await refresh();
    },
  };
}

interface DesignFeedbackProps {
  readonly state: ReturnType<typeof useFeedback>;
  readonly feedback: Feedback;
  readonly design: Feedback['designs'][number];
  readonly parcel: Parcel;
  readonly actions: ModerationActions;
}

/** One design's title line, the two count tables, the comments and the comment map. */
function DesignFeedbackBody({ state, feedback, design, parcel, actions }: DesignFeedbackProps) {
  const { picked } = state;
  const poster = usePoster(picked, parcel);
  return (
    <>
      <DesignPicker feedback={feedback} designId={state.designId} onPick={state.setChosen} />
      {picked === null ? null : (
        <p className="web-feedback__title" data-kind="data">
          {titleLine(picked.groups)}
        </p>
      )}
      <div className="web-feedback__charts">
        <CountTable caption={text.byElementKind} rows={elementKindRows(design)} />
        <CountTable caption={text.byKind} rows={commentKindRows(design)} />
      </div>
      {picked === null || poster === null ? null : (
        <>
          <CommentGroups groups={picked.groups} actions={actions} />
          <CommentMap
            title={design.title}
            poster={poster}
            parcel={parcel}
            marks={commentMarks(picked.document, picked.groups)}
          />
        </>
      )}
    </>
  );
}

/**
 * Element feedback on the insights page: per design, the comment counts by element kind and by
 * comment kind, the comments with Mark resolved, a reply and Hide, the comment map and the CSV.
 */
export function ElementFeedbackSection({ project, api, apiBaseUrl }: ElementFeedbackSectionProps) {
  const state = useFeedback(api, project.id);
  const parcel = useMemo(() => parcelSchema.parse(project.parcel), [project.parcel]);
  const { feedback } = state;
  const design = feedback?.designs.find((entry) => entry.designId === state.designId);
  const csvPath = `/projects/${encodeURIComponent(project.id)}/insights/element-comments.csv`;
  return (
    <section className="web-insights__section web-feedback" aria-labelledby="insights-feedback">
      <h2 id="insights-feedback">{text.heading}</h2>
      <p>{text.lede}</p>
      {state.failed === 'failed' ? <p role="alert">{text.failed}</p> : null}
      {feedback?.designs.length === 0 ? <p>{text.empty}</p> : null}
      {feedback === null || design === undefined ? null : (
        <DesignFeedbackBody
          state={state}
          feedback={feedback}
          design={design}
          parcel={parcel}
          actions={moderation(api, state.refresh)}
        />
      )}
      <DownloadLink
        href={apiUrl(apiBaseUrl, csvPath)}
        filename={`parkshape-${project.id}-element-comments.csv`}
        variant="secondary"
      >
        {text.download}
      </DownloadLink>
    </section>
  );
}
