import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import { formatCad, type CatalogItem } from '@parkshape/core';

import {
  gridMove,
  paletteCost,
  paletteGroups,
  type PaletteGroup,
  type PaletteGroupId,
} from '../editor/palette.js';

import { fill, type EditorStrings } from './strings.js';
import {
  buttonStyle,
  headingStyle,
  panelStyle,
  pressedButtonStyle,
  tabListStyle,
  tileCostStyle,
  tileGridStyle,
  tileImageStyle,
  tileNameStyle,
  tileSelectedStyle,
  tileStyle,
} from './styles.js';

export interface PaletteProps {
  readonly catalog: readonly CatalogItem[];
  readonly strings: EditorStrings;
  /** The entry being placed or drawn, if any. */
  readonly activeId: string | null;
  readonly paint: 'on' | 'off';
  readonly onPick: (catalogId: string) => void;
  readonly onPaint: (paint: 'on' | 'off') => void;
  /** The picture for an entry; the asset pipeline writes them to the public catalog-thumbs. */
  readonly thumbnailOf?: (catalogId: string) => string;
}

// Written by `pnpm --filter @parkshape/asset-pipeline thumbnails` into the web app's public folder.
const defaultThumbnail = (catalogId: string) => `/catalog-thumbs/${catalogId}.png`;
// The hover and pressed fills come from the press rules in the ui motion module.
const PRESS_CLASS = 'ps-motion-press';
const TAB_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

function costText(entry: CatalogItem, strings: EditorStrings): string {
  const cost = paletteCost(entry);
  if (cost === null) return '';
  const amount = formatCad(cost.amountCad);
  if (cost.unit === 'm2') return fill(strings.palette.costPerM2, { cost: amount });
  if (cost.unit === 'module') return fill(strings.palette.costPerModule, { cost: amount });
  return amount;
}

function groupOf(groups: readonly PaletteGroup[], id: string | null): PaletteGroupId | undefined {
  return groups.find((group) => group.entries.some((entry) => entry.id === id))?.group;
}

/** Tiles on the first row share its top edge; that count is the grid's column count. */
function columnsOf(tiles: readonly HTMLElement[]): number {
  const top = tiles[0]?.offsetTop ?? 0;
  return Math.max(tiles.filter((tile) => tile.offsetTop === top).length, 1);
}

interface TabsProps {
  readonly groups: readonly PaletteGroup[];
  readonly open: PaletteGroupId;
  readonly ids: {
    readonly heading: string;
    readonly grid: string;
    readonly tab: (group: string) => string;
  };
  readonly strings: EditorStrings;
  readonly onOpen: (group: PaletteGroupId) => void;
}

/** The tab row over the grid. Left and right arrows move between tabs and open them. */
function PaletteTabs({ groups, open, ids, strings, onOpen }: TabsProps): ReactElement {
  const row = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = TAB_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const nextIndex = (index + step + groups.length) % groups.length;
    const next = groups[nextIndex];
    if (next === undefined) return;
    onOpen(next.group);
    row.current?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
  };
  return (
    <div ref={row} role="tablist" aria-labelledby={ids.heading} style={tabListStyle}>
      {groups.map(({ group }, index) => (
        <button
          key={group}
          id={ids.tab(group)}
          type="button"
          role="tab"
          aria-selected={group === open}
          aria-controls={ids.grid}
          tabIndex={group === open ? 0 : -1}
          style={group === open ? pressedButtonStyle : buttonStyle}
          onClick={() => {
            onOpen(group);
          }}
          onKeyDown={(event) => {
            onKeyDown(event, index);
          }}
        >
          <span data-kind="data">{strings.palette.groups[group]}</span>
        </button>
      ))}
    </div>
  );
}

interface GridProps {
  readonly entries: readonly CatalogItem[];
  readonly id: string;
  readonly labelledBy: string;
  readonly props: PaletteProps;
}

/** The square tiles of one tab: a listbox with one focusable tile at a time. */
function PaletteGrid({ entries, id, labelledBy, props }: GridProps): ReactElement {
  const { strings, activeId } = props;
  const grid = useRef<HTMLDivElement>(null);
  const activeIndex = entries.findIndex((entry) => entry.id === activeId);
  const [focusIndex, setFocusIndex] = useState(Math.max(activeIndex, 0));
  const current = Math.min(activeIndex >= 0 ? activeIndex : focusIndex, entries.length - 1);
  const thumbnailOf = props.thumbnailOf ?? defaultThumbnail;
  const onKeyDown = (event: KeyboardEvent, index: number, entry: CatalogItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onPick(entry.id);
      return;
    }
    const tiles = [...(grid.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const next = gridMove(index, event.key, entries.length, columnsOf(tiles));
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    tiles[next]?.focus();
  };
  return (
    <div ref={grid} id={id} role="listbox" aria-labelledby={labelledBy} style={tileGridStyle}>
      {entries.map((entry, index) => {
        const name = strings.catalog[entry.id] ?? entry.id;
        const cost = costText(entry, strings);
        return (
          <div
            key={entry.id}
            role="option"
            aria-selected={entry.id === activeId}
            aria-label={`${name}, ${cost}`}
            title={name}
            tabIndex={index === current ? 0 : -1}
            className={PRESS_CLASS}
            data-press="tile"
            style={entry.id === activeId ? tileSelectedStyle : tileStyle}
            onClick={() => {
              setFocusIndex(index);
              props.onPick(entry.id);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index, entry);
            }}
          >
            <img src={thumbnailOf(entry.id)} alt="" style={tileImageStyle} draggable={false} />
            <span data-kind="data" style={tileNameStyle}>
              {name}
            </span>
            <span data-kind="data" style={tileCostStyle}>
              {cost}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Catalog entries as picture tiles under tabs. Picking one starts placing, a path or an area. */
export function Palette(props: PaletteProps): ReactElement {
  const { strings, activeId, paint } = props;
  const id = useId();
  const groups = paletteGroups(props.catalog);
  const [chosen, setChosen] = useState<PaletteGroupId | undefined>(groupOf(groups, activeId));
  const activeGroup = groupOf(groups, activeId);
  useEffect(() => {
    if (activeGroup !== undefined) setChosen(activeGroup);
  }, [activeGroup]);
  const open = groups.find((group) => group.group === chosen) ?? groups[0];
  const ids = {
    heading: `${id}-heading`,
    grid: `${id}-grid`,
    tab: (group: string) => `${id}-tab-${group}`,
  };
  return (
    <nav aria-labelledby={ids.heading} style={panelStyle}>
      <h2 id={ids.heading} style={headingStyle}>
        {strings.palette.heading}
      </h2>
      <div>
        <button
          type="button"
          aria-pressed={paint === 'on'}
          style={paint === 'on' ? pressedButtonStyle : buttonStyle}
          onClick={() => {
            props.onPaint(paint === 'on' ? 'off' : 'on');
          }}
        >
          {strings.palette.paint}
        </button>
      </div>
      {open === undefined ? null : (
        <>
          <PaletteTabs
            groups={groups}
            open={open.group}
            ids={ids}
            strings={strings}
            onOpen={setChosen}
          />
          <PaletteGrid
            key={open.group}
            entries={open.entries}
            id={ids.grid}
            labelledBy={ids.tab(open.group)}
            props={props}
          />
        </>
      )}
    </nav>
  );
}
