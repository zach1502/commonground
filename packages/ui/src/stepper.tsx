import { CheckIcon } from './alert-icon.js';
import { classNames } from './class-names.js';
import { useLinkClick } from './navigation.js';
import { VisuallyHidden } from './visually-hidden.js';

export interface StepperStep {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface StepperProps {
  /** Names the step list for screen readers, such as "Setup steps". */
  readonly label: string;
  readonly steps: readonly StepperStep[];
  readonly currentId: string;
  /** Steps that are finished; each links back so you can change it. */
  readonly doneIds: readonly string[];
  /** Read after a finished step's name, such as "Done". */
  readonly doneText: string;
}

function DoneStep({ step, doneText }: { readonly step: StepperStep; readonly doneText: string }) {
  const onClick = useLinkClick(step.href);
  return (
    <a href={step.href} onClick={onClick} className="ps-stepper__link">
      <span className="ps-stepper__mark">
        <CheckIcon />
      </span>
      {step.label} <VisuallyHidden>{doneText}</VisuallyHidden>
    </a>
  );
}

type StepState = 'current' | 'done' | 'todo';

function stateOf(step: StepperStep, props: StepperProps): StepState {
  if (step.id === props.currentId) return 'current';
  return props.doneIds.includes(step.id) ? 'done' : 'todo';
}

/** The visible list of wizard steps: done steps link back, the current one is marked. */
export function Stepper(props: StepperProps) {
  return (
    <nav aria-label={props.label} className="ps-stepper">
      <ol className="ps-stepper__list">
        {props.steps.map((step) => {
          const state = stateOf(step, props);
          return (
            <li
              key={step.id}
              className={classNames('ps-stepper__step', `ps-stepper__step--${state}`)}
              {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}
            >
              {state === 'done' ? (
                <DoneStep step={step} doneText={props.doneText} />
              ) : (
                <span className="ps-stepper__label">{step.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
