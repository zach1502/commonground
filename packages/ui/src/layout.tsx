import type { AriaRole, ReactNode } from 'react';

import { classNames } from './class-names.js';

export type Gap = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';

export interface LayoutProps {
  readonly children: ReactNode;
  readonly gap?: Gap;
  readonly as?: 'div' | 'section' | 'ul' | 'ol';
  readonly className?: string;
  readonly role?: AriaRole;
  readonly 'aria-label'?: string;
}

function layout(base: string) {
  return function LayoutBox({
    children,
    gap = 'medium',
    as = 'div',
    className,
    ...rest
  }: LayoutProps) {
    const Tag = as;
    return (
      <Tag {...rest} className={classNames(base, `ps-gap--${gap}`, className)}>
        {children}
      </Tag>
    );
  };
}

/** Children in a column with token spacing between them. */
export const Stack = layout('ps-stack');

/** Children in a wrapping row with token spacing between them. */
export const Inline = layout('ps-inline');
