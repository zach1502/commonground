import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Clock, PlanePoint } from '@parkshape/core';

import { format, messages } from '../../messages';
import { closingDate } from '../../pages/project-deadline';

import type { CommentDraft, SendResult } from './comment-composer';
import { commentFailure } from './comment-failure';
import type { ReviewApi, ReviewComment } from './review-api';
import type { ElementEntry } from './review-model';

export interface ReviewCommentsInput {
  readonly api: ReviewApi;
  readonly designId: string;
  readonly closesAt: string | null;
  readonly clock: Clock;
}

/** The element the composer is open on, and the tap point when it came from the scene. */
export interface ReviewSelection {
  readonly entry: ElementEntry;
  readonly surfacePoint?: PlanePoint | undefined;
}

export type LoadState = 'loading' | 'ready' | 'failed';

/** The design's comments, flat, oldest first; the list and the chips both read them. */
export function useReviewComments({
  api,
  designId,
}: Pick<ReviewCommentsInput, 'api' | 'designId'>) {
  const [comments, setComments] = useState<readonly ReviewComment[]>([]);
  const [load, setLoad] = useState<LoadState>('loading');
  const refetch = useCallback(async () => {
    try {
      const listed = await api.listComments(designId);
      setComments(listed.elements.flatMap((element) => element.comments));
      setLoad('ready');
    } catch {
      setLoad('failed');
    }
  }, [api, designId]);
  useEffect(() => {
    void refetch();
  }, [refetch]);
  return { comments, load, refetch };
}

function addBody(selection: ReviewSelection, draft: CommentDraft) {
  const { elementId, elementKind } = selection.entry.ref;
  const base = { elementId, kind: draft.kind, text: draft.text };
  const point = elementKind === 'item' ? undefined : selection.surfacePoint;
  return point === undefined ? base : { ...base, surfacePoint: point };
}

export interface CommentSender {
  readonly status: string;
  readonly editing: ReviewComment | undefined;
  readonly startEdit: (comment: ReviewComment) => void;
  readonly send: (draft: CommentDraft) => Promise<SendResult>;
  readonly reset: () => void;
}

/**
 * Adds or edits a comment on the selected element, then refetches so the list and the chip
 * change together. A failure keeps the draft and answers the CONTENT.md message.
 */
export function useCommentSender(
  input: ReviewCommentsInput & { readonly refetch: () => Promise<void> },
  selection: ReviewSelection | undefined,
): CommentSender {
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<ReviewComment | undefined>(undefined);
  const { api, designId, closesAt, refetch } = input;
  const send = async (draft: CommentDraft): Promise<SendResult> => {
    if (selection === undefined) return { kind: 'sent' };
    const label = selection.entry.label;
    try {
      if (editing === undefined) await api.addComment(designId, addBody(selection, draft));
      else await api.editComment(editing.id, { text: draft.text });
      setStatus(
        format(editing === undefined ? messages.review.added : messages.review.saved, { label }),
      );
      setEditing(undefined);
      await refetch();
      return { kind: 'sent' };
    } catch (error) {
      return { kind: 'failed', message: commentFailure(error, { closesAt, text: draft.text }) };
    }
  };
  const reset = useCallback(() => {
    setStatus('');
    setEditing(undefined);
  }, []);
  return { status, editing, startEdit: setEditing, send, reset };
}

/** The closed line under the composer heading, with the closing day when the project has one. */
export function closedLine(closesAt: string | null): string {
  if (closesAt === null) return messages.review.closedNoDate;
  return format(messages.review.closedNote, { date: closingDate(closesAt, 'long') });
}

/** Open comments per element on the scene chips and the list rows. */
export function useChipLabel(entries: readonly ElementEntry[]) {
  const names = useMemo(
    () => new Map<string, string>(entries.map((entry) => [entry.ref.elementId, entry.name])),
    [entries],
  );
  return useCallback(
    (elementId: string, count: number) => {
      const name = names.get(elementId) ?? elementId;
      const text = messages.review.chip;
      return format(count === 1 ? text.one : text.other, { count, name });
    },
    [names],
  );
}

/** Where focus goes when the composer closes: the row that opened it, or the scene. */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const remember = (element: HTMLElement | null) => {
    opener.current = element;
  };
  const restore = () => {
    opener.current?.focus();
  };
  return { remember, restore };
}
