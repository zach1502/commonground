export interface SourceBadgeProps {
  /** The publisher, such as "Vancouver Open Data". */
  readonly source: string;
  /** The dataset id, such as "public-trees". */
  readonly dataset: string;
  /** A short note for data a planner must check, such as "Check first". */
  readonly note?: string | undefined;
}

/** Names where a row of site data came from, as plain small text. */
export function SourceBadge({ source, dataset, note }: SourceBadgeProps) {
  return (
    <span className="ps-source">
      <span className="ps-source__name">{`${source}, ${dataset}`}</span>
      {note === undefined ? null : <span className="ps-source__note">{note}</span>}
    </span>
  );
}
