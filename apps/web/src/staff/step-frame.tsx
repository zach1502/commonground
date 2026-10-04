import type { ReactNode } from 'react';

import { Button, ButtonLink, Inline } from '@parkshape/ui';

import { messages } from '../messages';

import { previousStep, stepHref, type WizardStep } from './wizard-steps';

const strings = messages.planner.wizard;

export interface StepFrameProps {
  readonly step: WizardStep;
  readonly lede?: string | undefined;
  readonly children: ReactNode;
  /** The step's one primary action, such as Continue or Publish project. */
  readonly primary: {
    readonly label: string;
    readonly onPress: () => void;
    readonly state?: 'ready' | 'blocked' | 'pending';
  };
  /** A line under the buttons, such as why Continue is not ready yet. */
  readonly note?: string | undefined;
  /** 'pinned' keeps the buttons in view at the bottom of the window, for the tall editor step. */
  readonly actions?: 'pinned' | 'inline';
}

/** One wizard step: heading, lede, content, then the step's one primary action and Back. */
export function StepFrame({ step, lede, children, primary, note, actions }: StepFrameProps) {
  const back = previousStep(step);
  const state = primary.state ?? 'ready';
  return (
    <section className="web-wizard__step" aria-labelledby={`step-${step}`}>
      <h2 id={`step-${step}`} className="ps-visually-hidden">
        {strings.steps[step]}
      </h2>
      {lede === undefined ? null : <p className="web-wizard__lede">{lede}</p>}
      {children}
      <Inline
        gap="small"
        className={
          actions === 'pinned'
            ? 'web-wizard__actions web-wizard__actions--pinned'
            : 'web-wizard__actions'
        }
      >
        <Button
          variant="primary"
          isDisabled={state === 'blocked'}
          isPending={state === 'pending'}
          onPress={primary.onPress}
        >
          {primary.label}
        </Button>
        {back === null ? null : (
          <ButtonLink href={stepHref(back)} variant="tertiary">
            {strings.back}
          </ButtonLink>
        )}
      </Inline>
      {note === undefined ? null : <p className="web-wizard__note">{note}</p>}
    </section>
  );
}
