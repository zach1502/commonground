import type { CommentKind, ProjectPhase } from '@parkshape/core';
import { Badge, Button } from '@parkshape/ui';

import { messages } from '../../messages';

import type { ReviewComment } from './review-api';
import { canEditComment, relativeTime } from './review-model';

export interface CommentListProps {
  readonly comments: readonly ReviewComment[];
  readonly now: Date;
  readonly phase: ProjectPhase;
  readonly onEdit: (comment: ReviewComment) => void;
}

/** The kind's word from the locale, under the review.kind keys core names. */
export function kindLabel(kind: CommentKind): string {
  return messages.review.kind[kind];
}

function CommentEntry(props: Omit<CommentListProps, 'comments'> & { comment: ReviewComment }) {
  const { comment, onEdit } = props;
  const text = messages.review.comments;
  const reply = comment.plannerReply;
  return (
    <li className="web-review__comment">
      <p className="web-review__comment-meta">
        <span className="web-review__author" data-kind="data">
          {comment.author.displayName}
        </span>
        <span className="web-review__kind">{kindLabel(comment.kind)}</span>
        <time dateTime={comment.createdAt} data-kind="data">
          {relativeTime(comment.createdAt, props.now)}
        </time>
        {comment.status === 'resolved' ? <Badge tone="success">{text.resolved}</Badge> : null}
      </p>
      {comment.text === '' ? null : (
        <p className="web-review__comment-text" data-kind="data">
          {comment.text}
        </p>
      )}
      {reply === null ? null : (
        <div className="web-review__reply">
          <p className="web-review__reply-label">{text.reply}</p>
          <p data-kind="data">{reply.text}</p>
        </div>
      )}
      {canEditComment(comment, props) ? (
        <Button
          variant="tertiary"
          size="small"
          onPress={() => {
            onEdit(comment);
          }}
        >
          {text.edit}
        </Button>
      ) : null}
    </li>
  );
}

/** The comments on one element, newest last, as the API lists them. */
export function CommentList({ comments, ...rest }: CommentListProps) {
  if (comments.length === 0) return null;
  return (
    <ul className="web-review__comments">
      {comments.map((comment) => (
        <CommentEntry key={comment.id} comment={comment} {...rest} />
      ))}
    </ul>
  );
}
