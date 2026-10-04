import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import type { ItemsListRow } from '../editor/items-list.js';
import { SNAP_STEP_M } from '../editor/snap.js';
import { FADE, playEnter } from '../motion/panel-motion.js';

import type { ItemsListGroup } from './item-labels.js';
import {
  compactButtonStyle,
  countStyle,
  groupHeadingStyle,
  itemStyle,
  lineStyle,
  nameButtonStyle,
  selectedLineStyle,
  selectedNameStyle,
  tagStyle,
  toolsStyle,
} from './items-list-styles.js';
import type { ItemsListProps, RowAction } from './items-list-types.js';
import { fill, type EditorStrings } from './strings.js';
import { rowStyle } from './styles.js';

const NUDGES = [
  { key: 'north', delta: { x: 0, y: SNAP_STEP_M } },
  { key: 'south', delta: { x: 0, y: -SNAP_STEP_M } },
  { key: 'east', delta: { x: SNAP_STEP_M, y: 0 } },
  { key: 'west', delta: { x: -SNAP_STEP_M, y: 0 } },
] as const;

/** Rotate and duplicate act on items only; paths and areas can only be deleted. */
const ITEM_ACTIONS: readonly RowAction[] = ['rotate', 'duplicate', 'delete'];
const SHAPE_ACTIONS: readonly RowAction[] = ['delete'];

export interface RowProps {
  readonly row: ItemsListRow;
  readonly label: string;
  readonly props: ItemsListProps;
  /** Set on the first row of each category, which carries the category heading. */
  readonly group?: ItemsListGroup | undefined;
  /** The one row in the tab order; the arrow keys reach the rest. */
  readonly tabStop: 'stop' | 'skip';
  readonly onKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: () => void;
  /** 'new' when the element was added while the list was open, so its line fades in once. */
  readonly entry: 'new' | 'listed';
}

function NudgeGroup({ name, props }: { name: string; props: ItemsListProps }): ReactElement {
  const { strings } = props;
  return (
    <div role="group" aria-label={fill(strings.itemsList.nudge, { name })} style={rowStyle}>
      {NUDGES.map(({ key, delta }) => (
        <button
          key={key}
          type="button"
          style={compactButtonStyle}
          onClick={() => {
            props.onNudge(delta);
          }}
        >
          {strings.itemsList[key]}
        </button>
      ))}
    </div>
  );
}

function ActionButtons({ row, name, props }: Pick<RowProps, 'row' | 'props'> & { name: string }) {
  const { strings } = props;
  const labels = {
    rotate: { text: strings.toolbar.rotate, name: strings.itemsList.rotate },
    duplicate: { text: strings.toolbar.duplicate, name: strings.itemsList.duplicate },
    delete: { text: strings.toolbar.delete, name: strings.itemsList.delete },
  } as const;
  return (
    <>
      {(row.kind === 'item' ? ITEM_ACTIONS : SHAPE_ACTIONS).map((action) => (
        <button
          key={action}
          type="button"
          aria-label={fill(labels[action].name, { name })}
          style={compactButtonStyle}
          onClick={() => {
            props.onRowAction(action, { kind: row.kind, id: row.id });
          }}
        >
          {labels[action].text}
        </button>
      ))}
    </>
  );
}

/** The selected row's tools: the floating toolbar's actions when free, then the nudges. */
function RowTools({ row, name, props }: Pick<RowProps, 'row' | 'props'> & { name: string }) {
  if (row.locked === 'locked') return null;
  return (
    <div style={toolsStyle}>
      <ActionButtons row={row} name={name} props={props} />
      <NudgeGroup name={name} props={props} />
    </div>
  );
}

function GroupHeading(props: { group: ItemsListGroup; strings: EditorStrings }): ReactElement {
  return (
    <h3 style={groupHeadingStyle}>
      {props.strings.categories[props.group.category]}{' '}
      <span style={countStyle}>{props.group.rows.length}</span>
    </h3>
  );
}

/** Scrolls a node into view where the browser can; test DOMs have no scrollIntoView. */
export function bringIntoView(node: Partial<Pick<Element, 'scrollIntoView'>> | null): void {
  node?.scrollIntoView?.({ block: 'nearest' });
}

/** One element: its name by place, category and lock status, on one ruled line of the grid. */
export function Row(rowProps: RowProps): ReactElement {
  const { row, label, props, group } = rowProps;
  const { strings } = props;
  const name = strings.catalog[row.catalogId] ?? row.catalogId;
  const selected = row.selected === 'selected';
  const item = useRef<HTMLLIElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const { entry } = rowProps;
  useEffect(() => {
    if (entry === 'new') playEnter(line.current, FADE);
  }, [entry]);
  // A selection made while the list is open brings its row into view. On opening, the list's
  // own heading comes into view instead, so the row does not scroll it away.
  useEffect(() => {
    if (mounted.current && selected) bringIntoView(item.current);
    mounted.current = true;
  }, [selected]);
  return (
    <li ref={item} style={itemStyle}>
      {group === undefined ? null : <GroupHeading group={group} strings={strings} />}
      <div ref={line} data-row="" style={selected ? selectedLineStyle : lineStyle}>
        <span data-cell="name">
          <button
            type="button"
            data-row-button=""
            aria-pressed={selected}
            tabIndex={rowProps.tabStop === 'stop' ? 0 : -1}
            style={selected ? selectedNameStyle : nameButtonStyle}
            onKeyDown={rowProps.onKey}
            onFocus={rowProps.onFocus}
            onClick={() => {
              props.onSelect({ kind: row.kind, id: row.id });
            }}
          >
            {label}
          </button>
        </span>
        <span data-cell="status">
          {row.locked === 'locked' ? (
            <span style={tagStyle}>{strings.itemsList.locked}</span>
          ) : null}
        </span>
        {selected ? <RowTools row={row} name={name} props={props} /> : null}
      </div>
    </li>
  );
}
