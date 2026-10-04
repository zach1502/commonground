import { useEffect, useId, useRef, type ReactNode } from 'react';

import { CheckIcon } from './alert-icon.js';
import { Button } from './button.js';
import { classNames } from './class-names.js';
import { MOTION_CLASS } from './motion/index.js';

export interface ReasonOption {
  readonly id: string;
  readonly label: string;
}

export interface ReasonChipsProps {
  readonly heading: string;
  readonly reasons: readonly ReasonOption[];
  readonly selected: ReadonlySet<string>;
  readonly nextLabel: string;
  readonly skipLabel: string;
  readonly onToggle: (id: string) => void;
  /** Next sends the selected reasons in list order; Skip sends an empty list. */
  readonly onConfirm: (reasons: readonly string[]) => void;
  /** A line above the question, such as what the voter just chose. */
  readonly lead?: ReactNode;
  /** 'sheet' pins the chips to the window bottom on a phone, over the controls there. */
  readonly placement?: 'inline' | 'sheet';
}

interface ChipListProps {
  readonly reasons: readonly ReasonOption[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
}

/** One toggle button per reason; aria-pressed tells a screen reader which are on. */
function ChipList({ reasons, selected, onToggle }: ChipListProps) {
  return (
    <ul className="ps-reason-chips__list">
      {reasons.map((reason) => {
        const isOn = selected.has(reason.id);
        return (
          <li key={reason.id}>
            <button
              type="button"
              aria-pressed={isOn ? 'true' : 'false'}
              className={classNames('ps-chip', MOTION_CLASS.state, isOn && 'ps-chip--on')}
              onClick={() => {
                onToggle(reason.id);
              }}
            >
              {isOn ? (
                <CheckIcon className={classNames('ps-chip__check', MOTION_CLASS.reveal)} />
              ) : null}
              {reason.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Multi-select chips shown after a vote. They record why the voter chose what they did and stay
 * open until the voter presses Next or Skip, so nothing hides before a slow reader finishes
 * (WCAG 2.2.1). The heading takes focus when they open, so a screen reader hears the question.
 * Escape closes them as Skip does.
 */
export function ReasonChips({
  heading,
  reasons,
  selected,
  nextLabel,
  skipLabel,
  onToggle,
  onConfirm,
  lead,
  placement = 'inline',
}: ReasonChipsProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const chosen = () => reasons.filter((reason) => selected.has(reason.id)).map(({ id }) => id);
  return (
    <section
      className={classNames(
        'ps-reason-chips',
        MOTION_CLASS.reveal,
        placement === 'sheet' && 'ps-reason-chips--sheet',
      )}
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onConfirm([]);
      }}
    >
      <div className="ps-reason-chips__choices">
        {lead}
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="ps-reason-chips__heading">
          {heading}
        </h2>
        <ChipList reasons={reasons} selected={selected} onToggle={onToggle} />
      </div>
      <div className="ps-reason-chips__actions">
        <Button
          variant="secondary"
          onPress={() => {
            onConfirm([]);
          }}
        >
          {skipLabel}
        </Button>
        <Button
          onPress={() => {
            onConfirm(chosen());
          }}
        >
          {nextLabel}
        </Button>
      </div>
    </section>
  );
}
