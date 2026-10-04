import type { ReactElement } from 'react';

import type { EditorStrings } from './strings.js';
import { headingStyle, panelStyle } from './styles.js';

export interface SmallScreenNoticeProps {
  readonly strings: EditorStrings;
  readonly votingHref: string;
}

/** Shown instead of the editor under 1024 px; voting works on any screen. */
export function SmallScreenNotice({ strings, votingHref }: SmallScreenNoticeProps): ReactElement {
  const text = strings.smallScreen;
  return (
    <section style={panelStyle}>
      <h1 style={headingStyle}>{text.heading}</h1>
      <p style={{ margin: 0 }}>{text.body}</p>
      <p style={{ margin: 0 }}>
        <a href={votingHref}>{text.link}</a>
      </p>
    </section>
  );
}
