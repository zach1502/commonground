import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { documentPropertyReader, readPalette } from '@parkshape/scene/plan';

import type {
  CastVoteInput,
  Design,
  DesignSummary,
  Project,
  VoteReason,
  VoteValue,
  WebApi,
} from '../../api/web-api';

import type { EndChanges } from './end-changes';
import { posterFor } from './poster-source';
import type { SwipeAction } from './swipe';
import { usePlanDrawing } from './use-plan-drawing';
import { useVoteSender } from './use-vote-sender';
import { batchReducer, initialBatchState, type BatchAction, type BatchState } from './vote-batch';
import type { PosterSource } from './vote-poster';
import type { VoteSendStatus } from './vote-sender';

export type VoteApi = Pick<
  WebApi,
  'getDesign' | 'castVote' | 'getTerrain' | 'getContext' | 'setMyVote' | 'withdrawMyVote'
>;

interface FullDesign {
  readonly design: Design | null;
  readonly load: 'loading' | 'ready' | 'failed';
  readonly retry: () => void;
}

/** Fetches the full design, with its document, when the id changes or on a retry. */
function useFullDesign(api: Pick<WebApi, 'getDesign'>, id: string | null): FullDesign {
  const [design, setDesign] = useState<Design | null>(null);
  const [load, setLoad] = useState<FullDesign['load']>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (id === null) {
      setDesign(null);
      return;
    }
    let active = true;
    setLoad('loading');
    void api
      .getDesign(id)
      .then((next) => {
        if (!active) return;
        setDesign(next);
        setLoad('ready');
      })
      .catch(() => {
        if (active) setLoad('failed');
      });
    return () => {
      active = false;
    };
  }, [api, id, attempt]);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  return { design, load, retry };
}

export interface VoteBatch {
  readonly state: BatchState;
  readonly selected: ReadonlySet<VoteReason>;
  readonly showingToday: boolean;
  readonly shown: Design | null;
  /** What the picture shows: the candidate's summary, or the site today when comparing. */
  readonly poster: PosterSource | null;
  /** Set when the picture needs the full design and it failed to load. */
  readonly posterFailure: { readonly onRetry: () => void } | undefined;
  readonly onVote: (value: VoteValue) => void;
  readonly onSwipe: (action: SwipeAction) => void;
  readonly onToggleReason: (id: string) => void;
  /** Next or Skip on the reason chips: sends the vote with these reasons, then advances. */
  readonly onReasonsDone: (reasons: readonly string[]) => void;
  readonly onSkip: () => void;
  readonly onToggleCompare: () => void;
  /** The voter opened the 3D view, so the full design is needed from now on. */
  readonly onOpenModel: () => void;
  /** "failed" while a vote waits to be sent again. */
  readonly sendStatus: VoteSendStatus;
  /** The too-many-votes wait copy while a 429 window is open, or null. */
  readonly rateLimitMessage: string | null;
  /** True while a rate-limit window keeps the vote buttons disabled. */
  readonly isBlocked: boolean;
  /** What the end of the batch needs to change or withdraw each vote. */
  readonly endChanges: EndChanges;
}

/** The picture for the card, redrawn only when the design on it changes. */
function usePoster(
  summary: Pick<DesignSummary, 'id' | 'title' | 'thumbnailUrl'> | null,
  full: Design | null,
  project: Project,
): PosterSource | null {
  const palette = useMemo(() => readPalette(documentPropertyReader()), []);
  // A full design is fetched only when the card needs it, so that is when the plan code loads.
  const drawPlan = usePlanDrawing(full === null ? 'idle' : 'needed');
  return useMemo(
    () => posterFor({ summary, full, project, palette, drawPlan }),
    [summary, full, project, palette, drawPlan],
  );
}

/** The reason set with one reason added, or removed when it was already there. */
function toggled(selected: ReadonlySet<VoteReason>, reason: VoteReason): Set<VoteReason> {
  const next = new Set(selected);
  if (!next.delete(reason)) next.add(reason);
  return next;
}

/**
 * A swipe right votes up, left votes down and up skips. Swipes count only while the voter is
 * looking at a design, so a stray swipe cannot close the reason question.
 */
function swipeTo(
  phase: BatchState['phase'],
  onVote: (value: VoteValue) => void,
  onSkip: () => void,
) {
  return (action: SwipeAction) => {
    if (phase !== 'viewing') return;
    if (action === 'skip') onSkip();
    else onVote(action === 'up' ? 1 : -1);
  };
}

interface CardInput {
  readonly api: VoteApi;
  readonly project: Project;
  readonly current: DesignSummary | null;
  readonly baselineDesignId: string | null;
  readonly showingToday: boolean;
  readonly view: 'poster' | 'model';
}

/**
 * The full candidate is fetched only when its picture must be drawn from the document or the
 * 3D view is open, and the baseline only while comparing. A stored picture needs neither, so
 * nothing competes with it for the network on the first card.
 */
function neededIds({ current, baselineDesignId, showingToday, view }: CardInput) {
  const candidate =
    current !== null && (current.thumbnailUrl === null || view === 'model') ? current.id : null;
  return { candidate, baseline: showingToday ? baselineDesignId : null };
}

/** The design on the card, its picture, and a retry when the picture could not load. */
function useCard(input: CardInput) {
  const { api, project, current, showingToday } = input;
  const ids = neededIds(input);
  const candidate = useFullDesign(api, ids.candidate);
  const baseline = useFullDesign(api, ids.baseline);
  const full = showingToday ? baseline : candidate;
  const poster = usePoster(showingToday ? baseline.design : current, full.design, project);
  const posterFailure =
    poster === null && full.load === 'failed' ? { onRetry: full.retry } : undefined;
  return { shown: full.design, poster, posterFailure };
}

/** Whether the voter is comparing with today and whether the 3D view is open. */
function useCardViews() {
  const [showingToday, setShowingToday] = useState(false);
  const [view, setView] = useState<CardInput['view']>('poster');
  return {
    showingToday,
    view,
    onToggleCompare: () => {
      setShowingToday((now) => !now);
    },
    onOpenModel: () => {
      setView('model');
    },
  };
}

interface VoteActionsInput {
  readonly api: VoteApi;
  readonly state: BatchState;
  readonly current: DesignSummary | null;
  readonly dispatch: (action: BatchAction) => void;
  readonly onVoteRecorded: () => void;
}

/** The last vote sent for each design, so the end of the batch opens Change on it. */
function useSentVotes() {
  const [sent, setSent] = useState<ReadonlyMap<string, CastVoteInput>>(new Map());
  const record = (input: CastVoteInput) => {
    setSent((before) => new Map(before).set(input.designId, input));
  };
  return { sent, record };
}

/** Vote, reasons and skip for the design on the card; each vote goes out once, in order. */
function useVoteActions({ api, state, current, dispatch, onVoteRecorded }: VoteActionsInput) {
  const [selected, setSelected] = useState<Set<VoteReason>>(new Set());
  const votes = useVoteSender(api, onVoteRecorded);
  const { sent, record } = useSentVotes();
  const castCurrent = (value: VoteValue, reasons: readonly VoteReason[]) => {
    if (current === null) return;
    const input = { designId: current.id, value, reasons };
    record(input);
    votes.send(input);
  };
  const onVote = (value: VoteValue) => {
    if (state.phase !== 'viewing') return;
    setSelected(new Set());
    dispatch({ type: 'vote', value });
    castCurrent(value, []);
  };
  const onSkip = () => {
    dispatch({ type: 'skip' });
  };
  return {
    selected,
    onVote,
    onSkip,
    onSwipe: swipeTo(state.phase, onVote, onSkip),
    onToggleReason: (id: string) => {
      setSelected(toggled(selected, id as VoteReason));
    },
    onReasonsDone: (reasons: readonly string[]) => {
      // The vote went out when it was cast; only reasons add anything new.
      if (state.pendingValue !== null && reasons.length > 0) {
        castCurrent(state.pendingValue, reasons as VoteReason[]);
      }
      dispatch({ type: 'reasonsDone' });
    },
    sendStatus: votes.status,
    rateLimitMessage: votes.rateLimitMessage,
    isBlocked: votes.isBlocked,
    endChanges: {
      api,
      sent,
      before: votes.settled,
      onResult: (index, result) => {
        dispatch({ type: 'change', index, result });
      },
      onStored: (designId) => {
        votes.forget(designId);
        onVoteRecorded();
      },
    } satisfies EndChanges,
  };
}

export interface VoteBatchInput {
  readonly api: VoteApi;
  readonly project: Project;
  readonly candidates: readonly DesignSummary[];
  readonly baselineDesignId: string | null;
  /** Runs once the server has each vote. */
  readonly onVoteRecorded: () => void;
}

/** Batch state plus the vote, skip, reason and compare handlers for one review batch. */
export function useVoteBatch({
  api,
  project,
  candidates,
  baselineDesignId,
  onVoteRecorded,
}: VoteBatchInput): VoteBatch {
  const total = candidates.length;
  const [state, dispatch] = useReducer(
    (current: BatchState, action: BatchAction) => batchReducer(current, action, total),
    initialBatchState(),
  );
  const { showingToday, view, onToggleCompare, onOpenModel } = useCardViews();
  const current = state.phase === 'done' ? null : (candidates[state.index] ?? null);
  const { shown, poster, posterFailure } = useCard({
    api,
    project,
    current,
    baselineDesignId,
    showingToday,
    view,
  });
  const actions = useVoteActions({ api, state, current, dispatch, onVoteRecorded });
  return {
    state,
    showingToday,
    shown,
    poster,
    posterFailure,
    onToggleCompare,
    onOpenModel,
    ...actions,
  };
}
