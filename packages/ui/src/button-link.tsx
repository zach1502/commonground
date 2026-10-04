import type { ReactNode } from 'react';

import { classNames } from './class-names.js';
import { useLinkClick } from './navigation.js';

export type ButtonLinkVariant = 'primary' | 'secondary' | 'tertiary';

export interface ButtonLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: ButtonLinkVariant;
}

// The BC Link component draws its button style with these class names.
export const BC_BUTTON_CLASS = 'bcds-react-aria-Button medium';

/** A link that moves to another page and looks like a BC button. */
export function ButtonLink({ href, children, variant = 'primary' }: ButtonLinkProps) {
  const onClick = useLinkClick(href);
  return (
    <a
      href={href}
      onClick={onClick}
      className={classNames(BC_BUTTON_CLASS, variant, 'ps-button-link')}
      data-variant={variant}
    >
      {children}
    </a>
  );
}
