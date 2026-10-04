import type { ReactNode } from 'react';

import { BC_BUTTON_CLASS } from './button-link.js';
import { classNames } from './class-names.js';

export type DownloadLinkVariant = 'primary' | 'secondary';

export interface DownloadLinkProps {
  readonly href: string;
  /** Suggested file name; the server's attachment header wins across origins. */
  readonly filename: string;
  readonly children: ReactNode;
  readonly variant?: DownloadLinkVariant;
}

/** A link that downloads a file and looks like a BC button. */
export function DownloadLink({ href, filename, children, variant = 'primary' }: DownloadLinkProps) {
  return (
    <a
      href={href}
      download={filename}
      className={classNames(BC_BUTTON_CLASS, variant, 'ps-button-link')}
      data-variant={variant}
    >
      {children}
    </a>
  );
}
