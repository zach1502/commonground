import { cloneElement, type ReactElement, type ReactNode } from 'react';

import { SkipLink } from './skip-link.js';

export interface HeaderProps {
  readonly title: string;
  readonly skipLinkLabel: string;
  readonly mainId: string;
  /** A short status line shown beside the title, such as the demonstration notice. */
  readonly statusLabel?: string;
  /** An empty link element, such as a router link home; the header puts the title inside it. */
  readonly homeLinkElement?: ReactElement;
  readonly children?: ReactNode;
}

const TITLE_CLASS = 'bcds-header--title';

/**
 * The header with the product name as a text wordmark, a skip link and room for the site
 * navigation. The skip link is the first focusable element, so a keyboard user reaches the main
 * content before the wordmark.
 */
export function Header({
  title,
  skipLinkLabel,
  mainId,
  statusLabel,
  homeLinkElement,
  children,
}: HeaderProps) {
  return (
    <header className="bcds-header">
      <div className="bcds-header--container">
        <ul className="bcds-header--skiplinks">
          <li>
            <SkipLink targetId={mainId}>{skipLinkLabel}</SkipLink>
          </li>
        </ul>
        {homeLinkElement === undefined ? (
          <span className={TITLE_CLASS}>{title}</span>
        ) : (
          cloneElement(homeLinkElement, { className: TITLE_CLASS }, title)
        )}
        {statusLabel === undefined ? null : (
          <span className="bcds-header--status">{statusLabel}</span>
        )}
        {children}
      </div>
    </header>
  );
}
