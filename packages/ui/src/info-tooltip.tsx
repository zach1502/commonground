import {
  Button as BcButton,
  Tooltip as BcTooltip,
  TooltipTrigger,
} from '@bcgov/design-system-react-components';
import type { ReactNode } from 'react';

export interface InfoTooltipProps {
  /** The visible, focusable trigger text, for example "Why this order". */
  readonly triggerLabel: string;
  readonly children: ReactNode;
  readonly delayMs?: number;
}

// The tooltip trigger must be a react-aria button, so this uses the library button, not ui Button.
/** A BC tooltip behind a tertiary button, so keyboard and pointer users both reach the note. */
export function InfoTooltip({ triggerLabel, children, delayMs = 0 }: InfoTooltipProps) {
  return (
    <TooltipTrigger delay={delayMs}>
      <BcButton variant="tertiary" data-variant="tertiary">
        {triggerLabel}
      </BcButton>
      <BcTooltip>{children}</BcTooltip>
    </TooltipTrigger>
  );
}
