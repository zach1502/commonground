import { useEffect, useRef, useState, type RefObject } from 'react';

import { Button, ButtonLink, PageTitle } from '@parkshape/ui';

import type { DesignSummary, Project, QueuePoster } from '../../api/web-api';
import { messages } from '../../messages';
import { PATHS } from '../../routing/paths';

import { useCardAdvance } from './card-advance';
import type { SwipeAction } from './swipe';
import { useVoteBatch, type VoteApi, type VoteBatch } from './use-vote-batch';
import { useVoteStageBlock } from './use-vote-stage-block';
import { EndOfBatch } from './vote-batch-end';
import { VoteControls } from './vote-controls';
import { VoteStage } from './vote-stage';
import { useWarmNextPoster } from './warm-poster';

interface CompareButtonProps {
  readonly isDisabled: boolean;
  readonly showingToday: boolean;
  readonly onToggle: () => void;
}

/** Swaps the picture for the site as it is now, beside View in 3D under the stage. */
function CompareButton({ isDisabled, showingToday, onToggle }: CompareButtonProps) {
  return (
    <Button
      variant="secondary"
      size="small"
      isDisabled={isDisabled}
      aria-expanded={showingToday ? 'true' : 'false'}
      onPress={onToggle}
    >
      {messages.vote.compare}
    </Button>
  );
}

function CompareFor({
  batch,
  baselineDesignId,
}: {
  readonly batch: VoteBatch;
  readonly baselineDesignId: string | null;
}) {
  return (
    <CompareButton
      isDisabled={baselineDesignId === null}
      showingToday={batch.showingToday}
      onToggle={batch.onToggleCompare}
    />
  );
}

interface DesignHeadingProps {
  readonly title: string;
  /** 'take' after Next or Skip reasons, so focus lands on the new design and not on the page. */
  readonly focus: 'take' | 'leave';
}

/** The design's name, in small bold type after the progress count and above the picture. */
function DesignHeading({ title, focus }: DesignHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus === 'take') ref.current?.focus();
  }, [focus]);
  return (
    <h2 ref={ref} tabIndex={-1} className="web-vote__title" data-kind="data">
      {title}
    </h2>
  );
}

interface CardBarProps {
  readonly current: DesignSummary | undefined;
  readonly focusId: string | null;
}

/** The design's name on one line above the picture; "1 of 5" sits in the line under it. */
function CardBar({ current, focusId }: CardBarProps) {
  return (
    <div className="web-vote__bar">
      {current === undefined ? null : (
        <DesignHeading
          key={current.id}
          title={current.title}
          focus={current.id === focusId ? 'take' : 'leave'}
        />
      )}
    </div>
  );
}

function VoteTitle({ name }: { readonly name: string }) {
  return <PageTitle context={name}>{messages.vote.heading}</PageTitle>;
}

function EmptyBatch({ project }: { readonly project: Project }) {
  const text = messages.vote;
  const closed = project.phase === 'closed';
  return (
    <>
      <VoteTitle name={project.name} />
      <div className="web-vote__empty">
        <p className="web-empty">{closed ? text.closed : text.empty}</p>
        <ButtonLink variant="secondary" href={PATHS.leaderboard(project.id)}>
          {text.seeLeaderboard}
        </ButtonLink>
      </div>
    </>
  );
}

/**
 * Next or Skip reasons removes the focused button, so focus moves to the next design's heading.
 * Only that design takes focus; a later skip leaves focus on the Skip button.
 */
function useFocusAfterReasons(batch: VoteBatch, candidates: readonly DesignSummary[]) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const onReasonsDone = (reasons: readonly string[]) => {
    setFocusId(candidates[batch.state.index + 1]?.id ?? null);
    batch.onReasonsDone(reasons);
  };
  return { focusId, onReasonsDone };
}

/**
 * The batch with Next, Skip and the skip swipe wrapped so the card's picture is copied before the
 * next design renders, which lets the copy leave the way the reader sent it.
 */
function useAdvancingBatch(
  batch: VoteBatch,
  card: RefObject<HTMLDivElement>,
  onReasonsDone: (reasons: readonly string[]) => void,
) {
  const advance = useCardAdvance(card, batch.state.index);
  const { phase, pendingValue } = batch.state;
  const onSkip = () => {
    if (phase === 'viewing') advance.capture('skipped');
    batch.onSkip();
  };
  const onSwipe = (action: SwipeAction) => {
    if (action === 'skip' && phase === 'viewing') advance.capture('skipped');
    batch.onSwipe(action);
  };
  const onNext = (reasons: readonly string[]) => {
    if (phase === 'reasons')
      advance.capture(pendingValue !== null && pendingValue > 0 ? 'up' : 'down');
    onReasonsDone(reasons);
  };
  return { batch: { ...batch, onSkip, onSwipe }, onNext };
}

export interface VoteBatchViewProps {
  readonly api: VoteApi;
  readonly project: Project;
  readonly candidates: readonly DesignSummary[];
  readonly baselineDesignId: string | null;
  /** The first picture from the queue; its placeholder colour fills every card's box. */
  readonly lead?: QueuePoster | null;
  readonly onVoteMore: () => void;
  /** Runs once the server has a vote, so the next leaderboard view can show the rows it moved. */
  readonly onVoteRecorded: () => void;
}

/** One batch of five: shows one design at a time, records votes and reasons, then ends. */
export function VoteBatchView({
  api,
  project,
  candidates,
  baselineDesignId,
  lead,
  onVoteMore,
  onVoteRecorded,
}: VoteBatchViewProps) {
  const total = candidates.length;
  const raw = useVoteBatch({ api, project, candidates, baselineDesignId, onVoteRecorded });
  const { focusId, onReasonsDone } = useFocusAfterReasons(raw, candidates);
  const card = useRef<HTMLDivElement>(null);
  const { batch, onNext } = useAdvancingBatch(raw, card, onReasonsDone);
  const stageBlock = useVoteStageBlock(card, `${String(batch.state.index)}-${batch.state.phase}`);
  const onPosterLoad = useWarmNextPoster(candidates, batch.state.index);

  if (total === 0) return <EmptyBatch project={project} />;
  if (batch.state.phase === 'done') {
    return (
      <EndOfBatch
        project={project}
        voted={batch.state.voted}
        candidates={candidates}
        results={batch.state.results}
        onVoteMore={onVoteMore}
        changes={batch.endChanges}
      />
    );
  }
  return (
    <>
      <VoteTitle name={project.name} />
      <div ref={card} className={`web-vote__batch web-vote__batch--${batch.state.phase}`}>
        <CardBar current={candidates[batch.state.index]} focusId={focusId} />
        <VoteStage
          poster={batch.poster}
          posterFailure={batch.posterFailure}
          shown={batch.shown}
          project={project}
          api={api}
          onSwipe={batch.onSwipe}
          onOpenModel={batch.onOpenModel}
          placeholder={lead?.placeholder}
          onPosterLoad={onPosterLoad}
          blockSize={stageBlock}
          designId={candidates[batch.state.index]?.id}
          compare={<CompareFor batch={batch} baselineDesignId={baselineDesignId} />}
        />
        <VoteControls
          batch={batch}
          position={Math.min(batch.state.index + 1, total)}
          total={total}
          onReasonsDone={onNext}
        />
      </div>
    </>
  );
}
