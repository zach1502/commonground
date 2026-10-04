import { EmptyState } from '@parkshape/ui';

import type { Insights } from '../../api/staff-api';
import { messages } from '../../messages';
import { pluralise } from '../../plural';

const text = messages.insights.comments;

type DesignComments = Insights['comments']['byDesign'][number];

function DesignCommentList({ design }: { readonly design: DesignComments }) {
  const headingId = `insights-comments-${design.designId}`;
  return (
    <section className="web-insights__comments-design">
      <h3 id={headingId} data-kind="data">
        {design.title}
      </h3>
      <ul className="web-insights__comments" aria-labelledby={headingId}>
        {design.comments.map((comment) => (
          <li key={comment.voteId} className="web-insights__comment">
            <span className="web-insights__comment-name" data-kind="data">
              {comment.displayName}
            </span>
            <p className="web-insights__comment-text" data-kind="data">
              {comment.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What voters wrote with their votes, under each design, behind a closed disclosure whose
 * summary counts them, so the page shows one line until a planner opens it.
 */
export function CommentsFold({ comments }: { readonly comments: Insights['comments'] }) {
  return (
    <details className="web-insights__fold">
      <summary>{pluralise(comments.total, text.fold)}</summary>
      <div className="web-insights__fold-body">
        {comments.byDesign.length === 0 ? (
          <EmptyState text={text.empty} />
        ) : (
          comments.byDesign.map((design) => (
            <DesignCommentList key={design.designId} design={design} />
          ))
        )}
      </div>
    </details>
  );
}
