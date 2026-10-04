import { useId } from 'react';

import { Button } from './button.js';

export interface BlockingItem {
  readonly id: string;
  readonly message: string;
  /** The severity note, such as "Blocks submission". */
  readonly severityText: string;
  /** Whether the camera can move to this problem. */
  readonly canShow: boolean;
}

export interface BlockingListProps {
  /** Lets Submit move focus here when problems block it. */
  readonly id?: string;
  readonly heading: string;
  readonly items: readonly BlockingItem[];
  readonly showMeLabel: string;
  readonly onShowMe: (id: string) => void;
}

/** The problems that block a submit, listed above Submit; each can move the camera to itself. */
export function BlockingList({ id, heading, items, showMeLabel, onShowMe }: BlockingListProps) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section id={id} className="ps-blocking" aria-labelledby={headingId} role="alert" tabIndex={-1}>
      <h3 id={headingId} className="ps-blocking__heading">
        {heading}
      </h3>
      <ul className="ps-blocking__list">
        {items.map((item) => (
          <li key={item.id} className="ps-blocking__item">
            <span className="ps-blocking__message">{item.message}</span>
            <span className="ps-blocking__severity">{item.severityText}</span>
            {item.canShow ? (
              <Button
                variant="secondary"
                size="small"
                onPress={() => {
                  onShowMe(item.id);
                }}
              >
                {showMeLabel}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
