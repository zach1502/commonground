import type { ReactNode } from 'react';

/** Text for screen readers that takes no space on screen. */
export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="ps-visually-hidden">{children}</span>;
}
