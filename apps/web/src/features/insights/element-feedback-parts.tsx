import { useState } from 'react';

import { PLANNER_REPLY_MAX_CHARS, type Parcel } from '@parkshape/core';
import { Badge, Button } from '@parkshape/ui';

import { format, messages } from '../../messages';
import type { ReviewComment } from '../review/review-api';

import { posterFrame, type CommentMark, type DesignFeedback } from './element-feedback-model';

const text = messages.insights.feedback;

export interface CountRow {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/** A count table drawn as bars from zero: the bars are the chart, the cells its alternative. */
export function CountTable({ caption, rows }: { caption: string; rows: readonly CountRow[] }) {
  const most = Math.max(1, ...rows.map((row) => row.count));
  return (
    <table className="ps-table web-insights__table web-feedback__bars">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{text.groupColumn}</th>
          <th scope="col" className="ps-table__num">
            {text.countColumn}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">{row.label}</th>
            <td className="ps-table__num" data-kind="data">
              <span
                className="web-feedback__bar"
                aria-hidden="true"
                style={{
                  inlineSize: `calc(var(--feedback-bar-max) * ${String(row.count / most)})`,
                }}
              />
              {row.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function elementKindRows(design: DesignFeedback): CountRow[] {
  return (['item', 'path', 'area'] as const).map((kind) => ({
    id: kind,
    label: text.elementKind[kind],
    count: design.byElementKind[kind],
  }));
}

export function commentKindRows(design: DesignFeedback): CountRow[] {
  return (Object.keys(design.byKind) as (keyof DesignFeedback['byKind'])[]).map((kind) => ({
    id: kind,
    label: messages.review.kind[kind],
    count: design.byKind[kind],
  }));
}

export interface ModerationActions {
  readonly resolve: (commentId: string, reply: string) => Promise<void>;
  readonly setHidden: (commentId: string, hidden: boolean) => Promise<void>;
}

/** One comment with the planner's actions: a reply with Mark resolved, and Hide or Show. */
export function PlannerComment({
  comment,
  actions,
}: {
  readonly comment: ReviewComment;
  readonly actions: ModerationActions;
}) {
  const [reply, setReply] = useState('');
  const kind = messages.review.kind[comment.kind];
  const name = comment.text === '' ? kind : `${kind}: ${comment.text}`;
  return (
    <article aria-label={name} className="web-feedback__comment">
      <p className="web-feedback__meta">
        <span>{kind}</span>
        <span data-kind="data">{comment.author.displayName}</span>
        {comment.status === 'resolved' ? (
          <Badge tone="success">{messages.review.comments.resolved}</Badge>
        ) : null}
        {comment.hidden ? <Badge tone="neutral">{text.hidden}</Badge> : null}
      </p>
      {comment.text === '' ? null : <p data-kind="data">{comment.text}</p>}
      {comment.plannerReply === null ? null : (
        <p className="web-feedback__reply" data-kind="data">
          {comment.plannerReply.text}
        </p>
      )}
      {comment.status === 'open' ? (
        <label className="web-feedback__reply-field">
          {text.reply}
          <textarea
            rows={2}
            maxLength={PLANNER_REPLY_MAX_CHARS}
            value={reply}
            onChange={(event) => {
              setReply(event.target.value);
            }}
          />
        </label>
      ) : null}
      <div className="ps-inline ps-gap--small">
        {comment.status === 'open' ? (
          <Button
            variant="secondary"
            size="small"
            onPress={() => void actions.resolve(comment.id, reply.trim())}
          >
            {text.resolve}
          </Button>
        ) : null}
        <Button
          variant="tertiary"
          size="small"
          onPress={() => void actions.setHidden(comment.id, !comment.hidden)}
        >
          {comment.hidden ? text.show : text.hide}
        </Button>
      </div>
    </article>
  );
}

const MARK_RADIUS_M = 4.5;
const MARK_TEXT_M = 5;
// Five steps from light to near full, so even the lightest mark reads on the green plan.
const SHADE_OPACITY = 0.19;
const SHADE_FLOOR = 0.05;

/** The ranked marks as a table, the drawing's text alternative. */
function MarkTable({ marks }: { readonly marks: readonly CommentMark[] }) {
  return (
    <table className="ps-table web-insights__table">
      <caption>{text.mapTable}</caption>
      <thead>
        <tr>
          <th scope="col">{text.rankColumn}</th>
          <th scope="col">{text.elementColumn}</th>
          <th scope="col" className="ps-table__num">
            {text.countColumn}
          </th>
        </tr>
      </thead>
      <tbody>
        {marks.map((mark) => (
          <tr key={mark.elementId}>
            <td data-kind="data">{mark.rank}</td>
            <th scope="row" data-kind="data">
              {mark.label}
            </th>
            <td className="ps-table__num" data-kind="data">
              {mark.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The plan drawing with each most commented element marked by its rank, and the table. */
export function CommentMap(props: {
  readonly title: string;
  readonly poster: string;
  readonly parcel: Parcel;
  readonly marks: readonly CommentMark[];
}) {
  const frame = posterFrame(props.parcel);
  const box = [frame.left, frame.top, frame.width, frame.height].join(' ');
  return (
    <figure className="web-feedback__map">
      <h3>{text.map}</h3>
      <div
        className="web-feedback__drawing"
        role="img"
        aria-label={format(text.mapAlt, { title: props.title })}
      >
        <img src={props.poster} alt="" />
        <svg viewBox={box} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {props.marks.map((mark) => (
            <g
              key={mark.elementId}
              transform={`translate(${String(mark.at.x)} ${String(0 - mark.at.y)})`}
            >
              <circle
                r={MARK_RADIUS_M}
                className="web-feedback__mark"
                fillOpacity={SHADE_FLOOR + mark.shade * SHADE_OPACITY}
              />
              <text
                className="web-feedback__mark-label"
                fontSize={MARK_TEXT_M}
                textAnchor="middle"
                dy="0.35em"
              >
                {mark.rank}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption>{text.mapLegend}</figcaption>
      <MarkTable marks={props.marks} />
    </figure>
  );
}
