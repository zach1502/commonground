import type { MouseEvent, ReactNode } from 'react';

import { classNames } from './class-names.js';
import { MOTION_CLASS } from './motion/index.js';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: 'button' | 'submit';
  readonly isDisabled?: boolean;
  readonly isPending?: boolean;
  readonly onPress?: () => void;
  /** 'held' keeps the pressed colour after the press, such as on the vote just cast. */
  readonly held?: 'held' | 'rest';
  readonly id?: string;
  readonly 'aria-expanded'?: 'true' | 'false';
  readonly 'aria-pressed'?: 'true' | 'false';
  readonly 'aria-controls'?: string;
  readonly 'aria-describedby'?: string;
}

const BC_BUTTON = 'bcds-react-aria-Button';

// A native button with the B.C. Design System button class names, so the shell does not load
// react-aria. Danger is the BC primary button in its danger style. A pending button keeps focus
// and ignores presses, as the BC button does.
/** The BC Design System button. */
export function Button({
  variant = 'primary',
  size = 'medium',
  type = 'button',
  isDisabled,
  isPending,
  onPress,
  held = 'rest',
  children,
  ...aria
}: ButtonProps) {
  const isDanger = variant === 'danger';
  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (isPending === true) {
      event.preventDefault();
      return;
    }
    onPress?.();
  }
  return (
    <button
      {...aria}
      type={type}
      disabled={isDisabled}
      aria-disabled={isPending === true ? 'true' : undefined}
      data-pending={isPending === true ? 'true' : undefined}
      data-held={held === 'held' ? 'true' : undefined}
      className={classNames(
        BC_BUTTON,
        MOTION_CLASS.press,
        size,
        isDanger ? 'primary' : variant,
        isDanger && 'danger',
      )}
      data-variant={variant}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
