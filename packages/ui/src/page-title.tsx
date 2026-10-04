import type { ReactNode } from 'react';

export interface PageTitleProps {
  readonly children: ReactNode;
  readonly lede?: string;
  /** A plain line above the heading, such as the park name, so the heading can stay short. */
  readonly context?: string;
}

/** The page's one h1, with an optional context line above and a sentence under it. */
export function PageTitle({ children, lede, context }: PageTitleProps) {
  return (
    <div className="ps-page-title">
      {context === undefined ? null : <p className="ps-page-title__context">{context}</p>}
      <h1 className="ps-page-title__heading">{children}</h1>
      {lede === undefined ? null : <p className="ps-page-title__lede">{lede}</p>}
    </div>
  );
}
