import { useState } from 'react';

import type { ElementKind } from '@parkshape/core';

import { format, messages } from '../../messages';

import {
  categoryCounts,
  ELEMENT_KINDS,
  entriesIn,
  type CategoryFilter as Filter,
  type ElementEntry,
} from './review-model';

export interface ElementListProps {
  readonly entries: readonly ElementEntry[];
  readonly counts: ReadonlyMap<string, number>;
  readonly selectedId: string | undefined;
  /** A row pressed by pointer or keyboard; the row is where focus returns afterwards. */
  readonly onChoose: (entry: ElementEntry, row: HTMLButtonElement) => void;
}

/** "Bench, south-west, 3 comments": the row's accessible name and its text. */
export function rowName(entry: ElementEntry, count: number): string {
  const text = messages.review.list.row;
  return format(count === 1 ? text.one : text.other, { label: entry.label, count });
}

function KindGroup(props: ElementListProps & { readonly kind: ElementKind }) {
  const rows = props.entries.filter((entry) => entry.ref.elementKind === props.kind);
  if (rows.length === 0) return null;
  const heading = messages.review.list[props.kind];
  return (
    <section className="web-review__group">
      <h3 className="web-review__group-heading">{heading}</h3>
      <ul className="web-review__rows">
        {rows.map((entry) => {
          const count = props.counts.get(entry.ref.elementId) ?? 0;
          const selected = entry.ref.elementId === props.selectedId;
          return (
            <li key={entry.ref.elementId}>
              <button
                type="button"
                className="web-review__row"
                aria-label={rowName(entry, count)}
                aria-pressed={selected ? 'true' : 'false'}
                onClick={(event) => {
                  props.onChoose(entry, event.currentTarget);
                }}
              >
                <span data-kind="data">{entry.label}</span>
                <span className="web-review__row-count ps-table__num" data-kind="data">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FilterChip(props: {
  readonly label: string;
  readonly count: number;
  readonly on: boolean;
  readonly onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={props.on ? 'true' : 'false'}
        className={props.on ? 'ps-chip ps-chip--on' : 'ps-chip'}
        onClick={props.onPick}
      >
        {props.label} <span data-kind="data">{props.count}</span>
      </button>
    </li>
  );
}

/** All, then one chip per category the design has, so 40 trees do not bury the 1 bench. */
function CategoryChips(props: {
  readonly entries: readonly ElementEntry[];
  readonly filter: Filter;
  readonly onPick: (next: Filter) => void;
}) {
  const categories = categoryCounts(props.entries);
  if (categories.length <= 1) return null;
  const text = messages.review.list;
  return (
    <ul role="group" aria-label={text.filter} className="ps-reason-chips__list web-review__filter">
      <FilterChip
        label={text.all}
        count={props.entries.length}
        on={props.filter === 'all'}
        onPick={() => {
          props.onPick('all');
        }}
      />
      {categories.map(({ category, count }) => (
        <FilterChip
          key={category}
          label={messages.editor.categories[category]}
          count={count}
          on={props.filter === category}
          onPick={() => {
            props.onPick(category);
          }}
        />
      ))}
    </ul>
  );
}

/**
 * Every element of the design by kind, each a button that selects it, moves the camera to it
 * and opens the composer: the way in for keyboard and screen reader users. Category chips
 * narrow the list.
 */
export function ElementList(props: ElementListProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = entriesIn(props.entries, filter);
  return (
    <nav aria-label={messages.review.list.heading} className="web-review__list">
      <h2 className="web-review__list-heading">{messages.review.list.heading}</h2>
      <CategoryChips entries={props.entries} filter={filter} onPick={setFilter} />
      {ELEMENT_KINDS.map((kind) => (
        <KindGroup key={kind} {...props} entries={shown} kind={kind} />
      ))}
    </nav>
  );
}
