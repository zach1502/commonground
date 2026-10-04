import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  designDocumentSchema,
  parcelSchema,
  type Clock,
  type ElementRef,
  type PlanePoint,
} from '@parkshape/core';
import type { ReviewLayerProps } from '@parkshape/scene/viewer';
import { useLinkClick } from '@parkshape/ui';

import type { Design, Project, User } from '../../api/web-api';
import { messages } from '../../messages';
import { PATHS } from '../../routing/paths';

import { CommentComposer, type ComposerAccess } from './comment-composer';
import { CommentList } from './comment-list';
import { ElementList } from './element-list';
import type { ReviewApi, ReviewComment } from './review-api';
import { commentCounts, elementEntries, type ElementEntry } from './review-model';
import { useCarriedComments } from './use-carried-comments';
import {
  closedLine,
  useChipLabel,
  useCommentSender,
  useReturnFocus,
  useReviewComments,
  type ReviewSelection,
} from './use-review-comments';

export interface ReviewWorkspaceProps {
  readonly design: Design;
  readonly project: Project;
  readonly user: User | null;
  readonly api: ReviewApi;
  readonly clock: Clock;
  /** The 3D view, given the review layer; tests pass a stand-in. */
  readonly stage: (review: ReviewLayerProps) => ReactNode;
}

function accessFor(project: Project, user: User | null): ComposerAccess {
  if (project.phase === 'closed') return { kind: 'closed', line: closedLine(project.closesAt) };
  if (user === null) return { kind: 'sign-in', href: PATHS.login };
  return { kind: 'form' };
}

/** The selection, the camera request and the focus to give back when the composer closes. */
function useSelection(entries: readonly ElementEntry[]) {
  const [selection, setSelection] = useState<ReviewSelection | undefined>(undefined);
  const [frameRequest, setFrameRequest] = useState(0);
  const focus = useReturnFocus();
  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.ref.elementId, entry])),
    [entries],
  );
  const fromScene = (ref: ElementRef | undefined, surfacePoint?: PlanePoint) => {
    const entry = ref === undefined ? undefined : byId.get(ref.elementId);
    focus.remember(null);
    setSelection(entry === undefined ? undefined : { entry, surfacePoint });
  };
  const fromList = (entry: ElementEntry, row: HTMLButtonElement) => {
    focus.remember(row);
    setSelection({ entry });
    setFrameRequest((count) => count + 1);
  };
  const close = () => {
    setSelection(undefined);
    focus.restore();
  };
  return { selection, frameRequest, fromScene, fromList, close };
}

function commentsOn(comments: readonly ReviewComment[], elementId: string) {
  return comments.filter((comment) => comment.elementId === elementId);
}

function ReviewHeader({ design }: { readonly design: Design }) {
  const href = PATHS.designView(design.id);
  const onClick = useLinkClick(href);
  return (
    <div className="web-review__head">
      <h1 className="web-review__title" data-kind="data">
        {design.title}
      </h1>
      <a className="web-review__back" href={href} onClick={onClick}>
        {messages.review.back}
      </a>
    </div>
  );
}

interface SidePanelProps {
  readonly project: Project;
  readonly user: User | null;
  readonly clock: Clock;
  readonly stored: ReturnType<typeof useReviewComments>;
  readonly carried: readonly ReviewComment[];
  readonly sender: ReturnType<typeof useCommentSender>;
  readonly selected: ElementEntry | undefined;
  readonly onClose: () => void;
}

/** The composer for the selected element, or the empty line when the design has no comments. */
const LAST_VERSION_ID = 'review-last-version';

/** The last version's open comments on this element, read only, under their own heading. */
function LastVersion(props: {
  readonly comments: readonly ReviewComment[];
  readonly now: Date;
  readonly onEdit: (comment: ReviewComment) => void;
}) {
  if (props.comments.length === 0) return null;
  return (
    <section className="web-review__last-version" aria-labelledby={LAST_VERSION_ID}>
      <h3 id={LAST_VERSION_ID} className="web-review__group-heading">
        {messages.review.lastVersion}
      </h3>
      <CommentList comments={props.comments} now={props.now} phase="closed" onEdit={props.onEdit} />
    </section>
  );
}

function SidePanel(props: SidePanelProps) {
  const { project, user, clock, stored, sender, selected, onClose } = props;
  if (selected === undefined) {
    const empty = stored.comments.length === 0 && stored.load === 'ready';
    return empty ? <p className="web-review__empty">{messages.review.empty}</p> : null;
  }
  return (
    <CommentComposer
      key={selected.ref.elementId}
      label={selected.label}
      access={accessFor(project, user)}
      editing={sender.editing}
      onSend={sender.send}
      onCancel={onClose}
      status={sender.status}
    >
      <CommentList
        comments={commentsOn(stored.comments, selected.ref.elementId)}
        now={clock.now()}
        phase={project.phase}
        onEdit={sender.startEdit}
      />
      <LastVersion
        comments={commentsOn(props.carried, selected.ref.elementId)}
        now={clock.now()}
        onEdit={sender.startEdit}
      />
    </CommentComposer>
  );
}

/** The parsed design and parcel, their elements, the comments and the chip counts. */
function useReviewModel(props: ReviewWorkspaceProps) {
  const { design, project, api } = props;
  const document = useMemo(() => designDocumentSchema.parse(design.document), [design.document]);
  const parcel = useMemo(() => parcelSchema.parse(project.parcel), [project.parcel]);
  const entries = useMemo(() => elementEntries(document, parcel), [document, parcel]);
  const stored = useReviewComments({ api, designId: design.id });
  const counts = useMemo(() => commentCounts(stored.comments), [stored.comments]);
  const carried = useCarriedComments(api, design.versionOf, document);
  return { document, entries, stored, carried, counts, chipLabel: useChipLabel(entries) };
}

/**
 * Review mode on a submitted design: the read-only 3D view with count chips, the Elements list
 * and, for the selected element, its comments and the composer. Nothing here edits the design.
 */
export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const { design, project, api, clock } = props;
  const model = useReviewModel(props);
  const select = useSelection(model.entries);
  const input = { api, designId: design.id, closesAt: project.closesAt, clock };
  const sender = useCommentSender({ ...input, refetch: model.stored.refetch }, select.selection);
  const selected = select.selection?.entry;
  const review: ReviewLayerProps = {
    design: model.document,
    counts: model.counts,
    selected: selected?.ref,
    onSelect: (ref, point) => {
      sender.reset();
      select.fromScene(ref, point);
    },
    chipLabel: model.chipLabel,
    frameRequest: select.frameRequest,
  };
  const close = () => {
    sender.reset();
    select.close();
  };
  return (
    <div className="web-review">
      <ReviewHeader design={design} />
      <div className="web-review__stage">{props.stage(review)}</div>
      <aside className="web-review__side">
        <SidePanel
          {...props}
          stored={model.stored}
          carried={model.carried}
          sender={sender}
          selected={selected}
          onClose={close}
        />
        {model.stored.load === 'failed' ? <p role="alert">{messages.review.failure.load}</p> : null}
        <ElementList
          entries={model.entries}
          counts={model.counts}
          selectedId={selected?.ref.elementId}
          onChoose={(entry, row) => {
            sender.reset();
            select.fromList(entry, row);
          }}
        />
      </aside>
    </div>
  );
}
