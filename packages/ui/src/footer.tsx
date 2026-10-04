import type { ReactNode } from 'react';

export interface FooterProps {
  /** The disclosure summary over the full data and model sources. */
  readonly sourcesLabel: string;
  /** The full data and model attribution, folded under the disclosure. */
  readonly children: ReactNode;
}

/** The footer, cut to the full data and model sources under a closed native disclosure. */
export function Footer({ sourcesLabel, children }: FooterProps) {
  return (
    <footer className="bcds-footer">
      <div className="bcds-footer--container">
        <div className="bcds-footer--container-content">
          <details className="ps-footer ps-footer--folded">
            <summary className="ps-footer__summary">{sourcesLabel}</summary>
            <div className="ps-footer__sources">{children}</div>
          </details>
        </div>
      </div>
    </footer>
  );
}
