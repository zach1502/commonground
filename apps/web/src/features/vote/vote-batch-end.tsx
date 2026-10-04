import { useEffect, useId, useRef } from 'react';

import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';
import { Button, ButtonLink, InlineAlert, PageTitle, VisuallyHidden } from '@parkshape/ui';

import type { DesignSummary, Project } from '../../api/web-api';
import { YourVoteEditor } from '../../design/your-vote-editor';
import { format, messages } from '../../messages';
import { closingDate } from '../../pages/project-deadline';
import { pluralise } from '../../plural';
import { PATHS } from '../../routing/paths';

import { resultOf, sentVote, type EndChanges } from './end-changes';
import { draftOf, useFocusAfterEditing, useVoteChange, type VoteChange } from './use-vote-change';
import type { VoteResult } from './vote-batch';

// The row picture is a small 8:5 thumbnail next to the title.
const ROW_THUMB_SCALE = 8;

const RESULT_TEXT: Readonly<Record<VoteResult, string>> = {
  up: messages.vote.resultUp,
  down: messages.vote.resultDown,
  skipped: messages.vote.resultSkipped,
};

export interface EndOfBatchProps {
  readonly project: Project;
  readonly voted: number;
  readonly candidates: readonly DesignSummary[];
  readonly results: readonly VoteResult[];
  readonly onVoteMore: () => void;
  readonly changes: EndChanges;
}

/** "Voting closes 31 October 2026." while voting is open and the project has a closing day. */
function closesLine({ phase, closesAt }: Project): string | null {
  if (phase === 'closed' || closesAt === null) return null;
  return format(messages.vote.closes, { date: closingDate(closesAt, 'long') });
}

function ResultThumb({ design }: { readonly design: DesignSummary }) {
  if (design.thumbnailUrl === null) {
    return <span className="web-vote__result-thumb" aria-hidden="true" />;
  }
  return (
    <img
      className="web-vote__result-thumb"
      src={design.thumbnailUrl}
      alt={format(messages.vote.posterAlt, { title: design.title })}
      width={THUMBNAIL_WIDTH_PX / ROW_THUMB_SCALE}
      height={THUMBNAIL_HEIGHT_PX / ROW_THUMB_SCALE}
      loading="lazy"
    />
  );
}

/** The row's own live line: the saved or failure copy for its last change. */
function RowStatus({ change }: { readonly change: VoteChange }) {
  if (change.waitMessage !== null) return <InlineAlert tone="danger" title={change.waitMessage} />;
  const words: Record<VoteChange['status'], string> = {
    idle: '',
    saved: messages.designPage.yourVoteSaved,
    withdrawn: messages.voteChange.withdrawn,
    failed: change.failure ?? '',
  };
  return (
    <p role="status" className="web-vote__result-status">
      {words[change.status]}
    </p>
  );
}

interface ResultRowProps {
  readonly design: DesignSummary;
  readonly index: number;
  readonly result: VoteResult;
  readonly showResult: boolean;
  readonly changes: EndChanges;
}

/** One design in the batch, your vote on it, and Change, which opens the vote editor in place. */
function ResultRow({ design, index, result, showResult, changes }: ResultRowProps) {
  const ids = { title: useId(), change: useId() };
  const change = useVoteChange({
    api: changes.api,
    designId: design.id,
    initial: sentVote(changes.sent.get(design.id)),
    before: changes.before,
    onShown: (vote) => {
      changes.onResult(index, resultOf(vote));
    },
    onStored: () => {
      changes.onStored(design.id);
    },
  });
  useFocusAfterEditing(change, [ids.change]);
  return (
    <li className="web-vote__result">
      <ResultThumb design={design} />
      <a
        id={ids.title}
        className="web-vote__result-title"
        href={PATHS.designView(design.id)}
        data-kind="data"
      >
        {design.title}
      </a>
      {showResult ? (
        <span className="web-vote__result-vote">{RESULT_TEXT[result]}</span>
      ) : (
        <VisuallyHidden>{RESULT_TEXT[result]}</VisuallyHidden>
      )}
      <Button
        id={ids.change}
        variant="tertiary"
        size="small"
        aria-describedby={ids.title}
        isDisabled={change.isBlocked}
        onPress={change.open}
      >
        {messages.voteChange.change}
      </Button>
      {change.editing ? (
        <div className="web-vote__result-editor">
          <YourVoteEditor
            initial={draftOf(change.vote)}
            isBlocked={change.isBlocked}
            onSave={change.save}
            onCancel={change.cancel}
            {...(change.vote === null ? {} : { onWithdraw: change.withdraw })}
          />
        </div>
      ) : null}
      <RowStatus change={change} />
    </li>
  );
}
/**
 * The end of a batch: how many designs you voted on, when voting closes, and each design with
 * your vote. The last Next removed the focused button, so focus moves to the heading.
 */
export function EndOfBatch({
  project,
  voted,
  candidates,
  results,
  onVoteMore,
  changes,
}: EndOfBatchProps) {
  const text = messages.vote;
  const title = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = title.current?.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }, []);
  const closes = closesLine(project);
  const rendered = candidates
    .map((design, index) => ({ design, index, result: results[index] }))
    .filter(
      (row): row is { design: DesignSummary; index: number; result: VoteResult } =>
        row.result !== undefined,
    );
  const differ = rendered.some((row) => row.result !== rendered[0]?.result);
  return (
    <div className="web-vote__end">
      <div ref={title}>
        <PageTitle context={project.name}>{pluralise(voted, text.batchHeading)}</PageTitle>
      </div>
      {closes === null ? null : <p className="web-vote__closes">{closes}</p>}
      <ul className="web-vote__results" aria-label={text.resultsLabel}>
        {rendered.map(({ design, index, result }) => (
          <ResultRow
            key={design.id}
            design={design}
            index={index}
            result={result}
            showResult={differ}
            changes={changes}
          />
        ))}
      </ul>
      <div className="web-vote__end-actions">
        <Button onPress={onVoteMore}>{text.voteMore}</Button>
        <ButtonLink variant="secondary" href={PATHS.leaderboard(project.id)}>
          {text.seeLeaderboard}
        </ButtonLink>
      </div>
      <a href={PATHS.selfReport}>{text.selfReportLink}</a>
    </div>
  );
}
