import { useLinkClick } from './navigation.js';

export interface EmptyStateAction {
  readonly href: string;
  readonly label: string;
}

export interface EmptyStateProps {
  /** What is missing, in 20 words or fewer with the action label. */
  readonly text: string;
  /** The one task that fills the list, when the reader can do it. */
  readonly action?: EmptyStateAction;
}

function EmptyStateLink({ action }: { readonly action: EmptyStateAction }) {
  const onClick = useLinkClick(action.href);
  return (
    <a href={action.href} onClick={onClick} className="ps-empty__link">
      {action.label}
    </a>
  );
}

/** A left-aligned note for a list, table or chart with nothing in it, and a link to fill it. */
export function EmptyState({ text, action }: EmptyStateProps) {
  return (
    <div className="ps-empty">
      <p className="ps-empty__text">{text}</p>
      {action === undefined ? null : <EmptyStateLink action={action} />}
    </div>
  );
}
