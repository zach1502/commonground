import { useId, type ReactNode } from 'react';

import { AlertIcon } from './alert-icon.js';
import type { AlertTone } from './alert-tone.js';
import { Button } from './button.js';

export type { AlertTone } from './alert-tone.js';

export interface AlertAction {
  /** Names the recovery, such as "Try again". */
  readonly label: string;
  readonly onPress: () => void;
}

export interface InlineAlertProps {
  readonly tone: AlertTone;
  readonly title: string;
  readonly description?: string;
  /** A recovery step, for errors where trying again can work. */
  readonly action?: AlertAction;
  readonly children?: ReactNode;
}

interface AlertBodyProps extends Omit<InlineAlertProps, 'tone'> {
  readonly titleId: string;
}

// The BC alert draws its title only when it has no children, so an action alert draws its own.
function drawsOwnBody({ action, children }: Omit<InlineAlertProps, 'tone'>): boolean {
  return action === undefined && children !== undefined;
}

function AlertBody({ title, titleId, description, action, children }: AlertBodyProps) {
  return (
    <>
      <span className="title" id={titleId}>
        {title}
      </span>
      {description === undefined ? null : <span className="description">{description}</span>}
      {children}
      {action === undefined ? null : (
        <span className="ps-alert__action">
          <Button variant="secondary" size="small" onPress={action.onPress}>
            {action.label}
          </Button>
        </span>
      )}
    </>
  );
}

// Same markup and class names as the B.C. Design System InlineAlert, drawn without react-aria.
/** A BC inline alert. Danger alerts use the alert role so screen readers announce them. */
export function InlineAlert({ tone, ...body }: InlineAlertProps) {
  const titleId = useId();
  const label = drawsOwnBody(body) ? { 'aria-label': body.title } : { 'aria-labelledby': titleId };
  return (
    <div className={`bcds-Inline-Alert ${tone}`}>
      <span className="bcds-Inline-Alert--icon">
        <AlertIcon tone={tone} />
      </span>
      <div
        className="bcds-Inline-Alert--container"
        role={tone === 'danger' ? 'alert' : 'status'}
        {...label}
      >
        {drawsOwnBody(body) ? body.children : <AlertBody {...body} titleId={titleId} />}
      </div>
    </div>
  );
}
