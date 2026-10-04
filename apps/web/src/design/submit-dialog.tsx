import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  Badge,
  Button,
  Dialog,
  IndeterminateProgress,
  InlineAlert,
  SuccessCheck,
} from '@parkshape/ui';

import { failureCopyFor } from '../api/error-copy';
import type { HardFailure, SoftWarning, SubmitOutcome } from '../api/web-api';
import { messages } from '../messages';

export interface SubmitDialogProps {
  /** Saves the draft and submits it, returning what the server decided. */
  readonly onSubmit: () => Promise<SubmitOutcome>;
  /** Runs after a design goes live: capture the thumbnail and move to its page. */
  readonly onSuccess: (softWarnings: readonly SoftWarning[]) => void | Promise<void>;
  readonly onClose: () => void;
}

type Phase = 'idle' | 'submitting' | 'done' | 'error';

interface Result {
  readonly hardFailures: readonly HardFailure[];
  readonly softWarnings: readonly SoftWarning[];
  readonly capMessage: string | null;
}

const EMPTY: Result = { hardFailures: [], softWarnings: [], capMessage: null };

function Blocked({
  failures,
  title,
}: {
  readonly failures: readonly HardFailure[];
  readonly title: string;
}) {
  if (failures.length === 0) return null;
  return (
    <InlineAlert tone="danger" title={title}>
      <ul className="web-submit__failures">
        {failures.map((failure) => (
          <li key={failure.key}>{failure.message}</li>
        ))}
      </ul>
    </InlineAlert>
  );
}

function Warnings({
  warnings,
  label,
}: {
  readonly warnings: readonly SoftWarning[];
  readonly label: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="web-submit__warnings">
      <p className="web-submit__warnings-label">{label}</p>
      <ul className="web-submit__badges">
        {warnings.map((warning) => (
          <li key={warning.key}>
            <Badge tone="warning">{warning.badge}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** J21: a bar once the submit has waited 1 s, then one line with a drawn check when it passed. */
function SubmitProgress({ phase }: { readonly phase: Phase }) {
  const text = messages.submit;
  if (phase === 'submitting') return <IndeterminateProgress label={text.submitting} />;
  if (phase !== 'done') return null;
  return (
    <p className="web-submit__done" role="status">
      <SuccessCheck />
      {messages.submitSuccess.line}
    </p>
  );
}

/** Confirms a submit: lifecycle rules, hard failures that block, and soft warnings as badges. */
export function SubmitDialog({ onSubmit, onSuccess, onClose }: SubmitDialogProps): ReactNode {
  const text = messages.submit;
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Result>(EMPTY);
  const [errorText, setErrorText] = useState<string>(text.errorTitle);

  const run = async () => {
    setPhase('submitting');
    try {
      const outcome = await onSubmit();
      if (outcome.kind === 'submitted') {
        setPhase('done');
        await onSuccess(outcome.softWarnings);
        return;
      }
      setResult(outcomeResult(outcome));
      setPhase('idle');
    } catch (error) {
      setErrorText(failureCopyFor(error, 'submit').message);
      setPhase('error');
    }
  };

  return (
    <Dialog
      title={text.title}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="tertiary" onPress={close}>
            {text.cancel}
          </Button>
          <Button
            variant="primary"
            isPending={phase !== 'idle' && phase !== 'error'}
            onPress={() => void run()}
          >
            {text.action}
          </Button>
        </>
      )}
    >
      <ul className="web-submit__rules">
        {Object.values(text.rules).map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      {result.capMessage === null ? null : <InlineAlert tone="danger" title={result.capMessage} />}
      {phase === 'error' ? <InlineAlert tone="danger" title={errorText} /> : null}
      <SubmitProgress phase={phase} />
      <Blocked failures={result.hardFailures} title={text.blockedTitle} />
      <Warnings warnings={result.softWarnings} label={text.warningsLabel} />
    </Dialog>
  );
}

function outcomeResult(outcome: Exclude<SubmitOutcome, { kind: 'submitted' }>): Result {
  if (outcome.kind === 'capReached') {
    return { ...EMPTY, capMessage: outcome.message };
  }
  return {
    hardFailures: outcome.hardFailures,
    softWarnings: outcome.softWarnings,
    capMessage: null,
  };
}
