import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import { groupRows, rowLabels, rowNames, type ItemsListGroup } from './item-labels.js';
import { rowKeyEffect } from './items-list-keys.js';
import { gridStyle } from './items-list-styles.js';
import type { ItemsListProps } from './items-list-types.js';
import { AddForm } from './ItemsAddForm.js';
import { bringIntoView, Row } from './ItemsListRow.js';
import { headingStyle, helpStyle, panelStyle } from './styles.js';

export type { ItemsListProps, RowAction } from './items-list-types.js';

const rowButtonsOf = (list: HTMLElement | null): HTMLElement[] => [
  ...(list?.querySelectorAll<HTMLElement>('[data-row-button]') ?? []),
];

/** Rows in the order they are drawn: by category, then by name and place. */
function drawnRows(groups: readonly ItemsListGroup[]) {
  return groups.flatMap((group) =>
    group.rows.map((entry, index) => ({
      ...entry,
      group: index === 0 ? group : undefined,
    })),
  );
}

type DrawnRow = ReturnType<typeof drawnRows>[number];

/**
 * Keyboard moves inside the list: one row is in the tab order and the keys in `rowKeyEffect`
 * do the rest. After a Delete, focus waits for the list to redraw, then lands on the next row.
 */
function useRowKeys(rows: readonly DrawnRow[], props: ItemsListProps) {
  const list = useRef<HTMLUListElement>(null);
  const pending = useRef<number | null>(null);
  const [active, setActive] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (pending.current === null) return;
    const buttons = rowButtonsOf(list.current);
    buttons[Math.min(pending.current, buttons.length - 1)]?.focus();
    pending.current = null;
  }, [rows]);
  const stopId =
    rows.find((entry) => entry.row.id === active)?.row.id ??
    rows.find((entry) => entry.row.selected === 'selected')?.row.id ??
    rows[0]?.row.id;
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const entry = rows[index];
    if (entry === undefined) return;
    const effect = rowKeyEffect(event.key, { index, count: rows.length, locked: entry.row.locked });
    if (effect.kind === 'pass') return;
    // The page's shortcuts would read these keys as camera moves or a delete of the selection.
    event.preventDefault();
    event.stopPropagation();
    const ref = { kind: entry.row.kind, id: entry.row.id };
    if (effect.kind === 'focus') rowButtonsOf(list.current)[effect.index]?.focus();
    else if (effect.kind === 'select') props.onSelect(ref);
    else if (effect.kind === 'delete') {
      pending.current = index;
      props.onRowAction('delete', ref);
    }
  };
  return { list, stopId, onKey, setActive };
}

/**
 * Ids added since the last render while the list was open. The rows the list opens with are not
 * new, and a removed row simply leaves.
 */
function useNewRowIds(ids: readonly string[]): ReadonlySet<string> {
  const listed = useRef<ReadonlySet<string> | null>(null);
  const before = listed.current;
  useEffect(() => {
    listed.current = new Set(ids);
  });
  return before === null ? NO_IDS : new Set(ids.filter((id) => !before.has(id)));
}

const NO_IDS: ReadonlySet<string> = new Set();

/** Every placed element, with the same actions as the floating toolbar, for keyboard users. */
export function ItemsList(props: ItemsListProps): ReactElement {
  const { strings, rows } = props;
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const drawn = drawnRows(
    groupRows(rows, rowLabels(rows, strings), props.catalog, rowNames(rows, strings)),
  );
  const keys = useRowKeys(drawn, props);
  const fresh = useNewRowIds(drawn.map((entry) => entry.row.id));
  // The list opens at the top of its column; bring it into view if the column was scrolled.
  // A row selected before the list opened then comes into view too, with its actions.
  useEffect(() => {
    bringIntoView(section.current);
    bringIntoView(keys.list.current?.querySelector('[aria-pressed="true"]')?.closest('li') ?? null);
  }, [keys.list]);
  return (
    <section ref={section} aria-labelledby={id} style={panelStyle}>
      <h2 id={id} style={headingStyle}>
        {strings.itemsList.heading}
      </h2>
      {rows.length === 0 ? <p style={helpStyle}>{strings.itemsList.empty}</p> : null}
      <ul ref={keys.list} aria-labelledby={id} style={gridStyle}>
        {drawn.map((entry, index) => (
          <Row
            key={entry.row.id}
            row={entry.row}
            label={entry.label}
            group={entry.group}
            props={props}
            tabStop={entry.row.id === keys.stopId ? 'stop' : 'skip'}
            entry={fresh.has(entry.row.id) ? 'new' : 'listed'}
            onKey={(event) => {
              keys.onKey(event, index);
            }}
            onFocus={() => {
              keys.setActive(entry.row.id);
            }}
          />
        ))}
      </ul>
      <AddForm {...props} />
    </section>
  );
}
