import { useEffect, useRef } from 'react';

import {
  ProgressCount,
  ReasonChips,
  VoteButtons,
  InlineAlert,
  type ReasonOption,
} from '@parkshape/ui';

import { format, messages } from '../../messages';

import type { VoteBatch } from './use-vote-batch';
import type { BatchState } from './vote-batch';
import { REASON_IDS } from './vote-reasons';

const REASON_OPTIONS: readonly ReasonOption[] = REASON_IDS.map((id) => ({
  id,
  label: messages.vote.reasons[id],
}));

interface VoteLineProps {
  readonly phase: BatchState['phase'];
  readonly sendStatus: VoteBatch['sendStatus'];
  readonly position: number;
  readonly total: number;
}

/**
 * The one line under the stage: "1 of 5" and, while swipes count, the swipe hint. It keeps its
 * height after a vote, so the stage above never changes size.
 */
function VoteLine({ phase, sendStatus, position, total }: VoteLineProps) {
  return (
    <div className="web-vote__line" data-testid="vote-line">
      <ProgressCount
        label={format(messages.vote.progress, { current: position, total })}
        current={position}
        total={total}
      />
      {sendStatus === 'failed' ? (
        <p className="web-vote__hint">{messages.vote.sendFailed}</p>
      ) : null}
      {phase === 'viewing' && sendStatus === 'sent' && position === 1 ? (
        <p className="web-vote__hint">{messages.vote.swipeHint}</p>
      ) : null}
    </div>
  );
}

type BandState = 'open' | 'covered';

/** The vote just cast, so its button keeps the pressed colour while the reasons are open. */
function chosenVote(pending: BatchState['pendingValue']): 'up' | 'down' | null {
  if (pending === null) return null;
  return pending > 0 ? 'up' : 'down';
}

/**
 * The vote buttons' band. While the reasons sheet covers it, it stays in place, so nothing on
 * the page moves, but it is inert and hidden from screen readers, so Next is the one action.
 */
function VoteButtonsBand({ batch, band }: { readonly batch: VoteBatch; readonly band: BandState }) {
  const text = messages.vote;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.toggleAttribute('inert', band === 'covered');
  }, [band]);
  return (
    <div
      ref={ref}
      className="web-vote__actions"
      data-testid="vote-actions"
      aria-hidden={band === 'covered' ? 'true' : undefined}
    >
      <VoteButtons
        upLabel={text.up}
        downLabel={text.down}
        skipLabel={text.skip}
        isDisabled={batch.isBlocked}
        chosen={chosenVote(batch.state.pendingValue)}
        onUp={() => {
          batch.onVote(1);
        }}
        onDown={() => {
          batch.onVote(-1);
        }}
        onSkip={batch.onSkip}
      />
    </div>
  );
}

interface ControlsProps {
  readonly batch: VoteBatch;
  readonly position: number;
  readonly total: number;
  /** Next, Skip reasons or Escape, which also moves focus to the next design. */
  readonly onReasonsDone: (reasons: readonly string[]) => void;
}

/**
 * The line under the stage and the vote buttons. After a vote the reason chips open as a sheet
 * over the vote buttons on a phone, with Next where Vote up was; wider windows show them inline.
 */
export function VoteControls({ batch, position, total, onReasonsDone }: ControlsProps) {
  const { phase } = batch.state;
  const text = messages.vote;
  return (
    <div className={controlsClass(phase)}>
      <VoteLine
        phase={phase}
        sendStatus={batch.state.phase === 'done' ? 'sent' : batch.sendStatus}
        position={position}
        total={total}
      />
      {batch.rateLimitMessage === null ? null : (
        <InlineAlert tone="danger" title={batch.rateLimitMessage} />
      )}
      <VoteButtonsBand batch={batch} band={phase === 'reasons' ? 'covered' : 'open'} />
      {phase === 'reasons' ? (
        <ReasonChips
          placement="sheet"
          heading={text.reasonsHeading}
          reasons={REASON_OPTIONS}
          selected={batch.selected}
          nextLabel={text.reasonsNext}
          skipLabel={text.reasonsSkip}
          onToggle={batch.onToggleReason}
          onConfirm={onReasonsDone}
        />
      ) : null}
    </div>
  );
}

/** The vote buttons stick to the bottom; the reason chips do not, so they never cover View in 3D. */
function controlsClass(phase: BatchState['phase']): string {
  return phase === 'reasons'
    ? 'web-vote__controls'
    : 'web-vote__controls web-vote__controls--sticky';
}
