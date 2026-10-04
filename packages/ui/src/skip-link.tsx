import type { ReactNode } from 'react';

export interface SkipLinkProps {
  readonly targetId: string;
  readonly children: ReactNode;
}

/** A link that stays hidden until focused and jumps to the main content. */
export function SkipLink({ targetId, children }: SkipLinkProps) {
  return (
    <a className="ps-skip-link" href={`#${targetId}`}>
      {children}
    </a>
  );
}
