import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useStore } from 'zustand';

import { beginAddCorner } from '../editor/actions/areas.js';
import type { EditorContext } from '../editor/actions/context.js';
import { runAction } from '../editor/actions/keys.js';
import { placeItemAt, startPlacing } from '../editor/actions/placing.js';
import {
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  rotateSelectionByDrag,
  setItemPosition,
  setItemRotation,
} from '../editor/actions/selecting.js';
import { itemsListRows } from '../editor/items-list.js';
import { propertiesOf } from '../editor/properties.js';
import type { EditorState } from '../editor/store/types.js';
import { formatReadout, terraformReadout } from '../editor/terraform/readout.js';
import type { ElementRef } from '../editor/types.js';

import { Hints } from './Hints.js';
import { ItemsList, type RowAction } from './ItemsList.js';
import { Palette } from './Palette.js';
import { panelsFor } from './panel-modes.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { noticeText, placingText } from './reason-text.js';
import { ShortcutsSheet } from './ShortcutsSheet.js';
import type { EditorFeatures, EditorStrings } from './strings.js';
import { noticeStyle, panelStyle } from './styles.js';
import { TerraformControls } from './terraform/TerraformControls.js';
import { ToolBar, type ToolKind } from './ToolBar.js';

export interface SidebarProps {
  readonly ctx: EditorContext;
  readonly strings: EditorStrings;
}

const NO_FEATURES: EditorFeatures = { terraform: 'off' };

// The tool row stays at the top of its column while the palette scrolls under it.
const toolRowStyle = {
  ...panelStyle,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  borderBlockEnd: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
} as const;

function activeEntry(state: EditorState): string | null {
  const { tool } = state;
  if (tool.kind === 'place' || tool.kind === 'area') return tool.catalogId;
  return tool.kind === 'path' ? `path-${tool.surface}` : null;
}

function hintOf(state: EditorState, strings: EditorStrings): string | null {
  const nameOf = (id: string) => {
    const item = state.document.items.find((entry) => entry.id === id);
    const area = state.document.areas.find((entry) => entry.id === id);
    const catalogId = item?.catalogId ?? area?.catalogId ?? id;
    return strings.catalog[catalogId] ?? catalogId;
  };
  const notice = noticeText(state.notice, strings, nameOf);
  if (notice !== null) return notice;
  const hints: Partial<Record<EditorState['tool']['kind'], string>> = {
    path: strings.notices.pathHint,
    area: strings.notices.areaHint,
    'add-corner': strings.notices.cornerHint,
  };
  return hints[state.tool.kind] ?? null;
}

function toolKindOf(state: EditorState): ToolKind | 'other' {
  const { kind } = state.tool;
  if (kind === 'select' || kind === 'path' || kind === 'area' || kind === 'terraform') return kind;
  return 'other';
}

/** Tools, the notice line and the palette, on the left of the canvas. */
export function ToolsSidebar({
  ctx,
  strings,
  features = NO_FEATURES,
}: SidebarProps & { readonly features?: EditorFeatures }): ReactElement {
  const state = useStore(ctx.store, (current) => current);
  const catalog = useMemo(() => [...ctx.catalog.values()], [ctx.catalog]);
  const hint = hintOf(state, strings);
  const toolActions = { select: 'toolSelect', path: 'toolPath', area: 'toolArea' } as const;
  return (
    <>
      <div data-tool-row="" style={toolRowStyle}>
        <ToolBar
          strings={strings}
          tool={toolKindOf(state)}
          snap={state.snap}
          itemsList={state.itemsList}
          showTerraform={features.terraform === 'on' ? 'yes' : 'no'}
          onTool={(tool) => {
            if (tool === 'terraform') state.setTool({ kind: 'terraform' });
            else runAction(ctx, toolActions[tool]);
          }}
          onSnap={state.setSnap}
          onItemsList={state.setItemsList}
          onShortcuts={() => {
            state.setShortcuts('open');
          }}
        />
        <p role="status" style={hint === null ? { display: 'none' } : noticeStyle}>
          {hint}
        </p>
      </div>
      <PaletteFold state={panelsFor(state.tool).palette} strings={strings}>
        <Palette
          catalog={catalog}
          strings={strings}
          activeId={activeEntry(state)}
          paint={state.paint}
          onPick={(catalogId) => {
            startPlacing(ctx, catalogId);
          }}
          onPaint={state.setPaint}
        />
      </PaletteFold>
    </>
  );
}

// The summary keeps its list-item display, so the browser draws the open and closed marker.
const foldStyle = {
  padding: 'var(--layout-padding-medium)',
  font: 'var(--typography-bold-body)',
  color: 'var(--typography-color-primary)',
  cursor: 'pointer',
} as const;

/** While terraforming, the palette waits under a closed disclosure so the brush has the column. */
function PaletteFold({
  state,
  strings,
  children,
}: {
  readonly state: 'folded' | 'open';
  readonly strings: EditorStrings;
  readonly children: ReactNode;
}): ReactElement {
  if (state === 'open') return <>{children}</>;
  return (
    <details>
      <summary style={foldStyle}>{strings.palette.terraformFold}</summary>
      {children}
    </details>
  );
}

/** A row's button selects its element, then runs the floating toolbar's action on it. */
function runRowAction(ctx: EditorContext, action: RowAction, ref: ElementRef): void {
  ctx.store.getState().select([ref], 'replace');
  if (action === 'rotate') rotateSelectionByDrag(ctx, 0);
  else if (action === 'duplicate') duplicateSelection(ctx);
  else deleteSelection(ctx);
}

/** The Items list when it is open, then properties and the app's meters slot, on the right. */
export function DetailsSidebar({
  ctx,
  strings,
  children,
}: SidebarProps & { readonly children?: ReactNode }) {
  const state = useStore(ctx.store, (current) => current);
  const panels = panelsFor(state.tool);
  const catalog = useMemo(() => [...ctx.catalog.values()], [ctx.catalog]);
  const items = state.selection.filter((ref) => ref.kind === 'item');
  return (
    <>
      {state.itemsList === 'shown' ? (
        <ItemsList
          rows={itemsListRows(state.document, state.selection)}
          strings={strings}
          catalog={catalog}
          onSelect={(ref) => {
            state.select([ref], 'replace');
          }}
          onNudge={(delta) => {
            nudgeSelection(ctx, delta);
          }}
          onRowAction={(action, ref) => {
            runRowAction(ctx, action, ref);
          }}
          onAdd={(catalogId, position) => placeItemAt(ctx, catalogId, position)}
        />
      ) : null}
      {panels.details.includes('terraform') ? (
        <TerraformControls
          strings={strings}
          settings={state.terraform}
          readout={formatReadout(terraformReadout(ctx, state.document))}
          canLevelItem={items.length === 1 ? 'yes' : 'no'}
          onSettings={state.setTerraform}
        />
      ) : null}
      {panels.details.includes('properties') ? (
        <PropertiesPanel
          properties={propertiesOf(state.document, state.selection, ctx.catalog)}
          strings={strings}
          onPosition={(id, position) => {
            setItemPosition(ctx, id, position);
          }}
          onRotation={(id, degrees) => {
            setItemRotation(ctx, id, degrees);
          }}
          onAddCorner={(id) => {
            beginAddCorner(ctx, id);
          }}
        />
      ) : null}
      {children}
    </>
  );
}

// Top right of the canvas, clear of the view buttons at the top left; one line, never wrapped.
const canvasLineStyle = {
  position: 'absolute',
  insetBlockStart: 'var(--layout-margin-medium)',
  insetInlineEnd: 'var(--layout-margin-medium)',
  pointerEvents: 'none',
} as const;
const placingLineStyle = { ...noticeStyle, whiteSpace: 'nowrap' } as const;

/** The line at the top of the canvas while an item follows the cursor, saying how to stop. */
export function PlacingLine({ ctx, strings }: SidebarProps): ReactElement {
  const placing = useStore(ctx.store, (state) =>
    panelsFor(state.tool).canvasLine === 'placing' ? placingText(state.tool, strings) : null,
  );
  return (
    <div data-canvas-line="" style={canvasLineStyle}>
      <p role="status" style={placing === null ? { display: 'none' } : placingLineStyle}>
        {placing}
      </p>
    </div>
  );
}

/** The first-visit hints and the shortcuts sheet, laid over the canvas. */
export function CanvasOverlays({ ctx, strings }: SidebarProps): ReactElement {
  const hints = useStore(ctx.store, (state) => state.hints);
  const toolKind = useStore(ctx.store, (state) => state.tool.kind);
  const shortcuts = useStore(ctx.store, (state) => state.shortcuts);
  const { dismissHint, setShortcuts } = ctx.store.getState();
  return (
    <>
      <ShortcutsSheet
        state={shortcuts}
        strings={strings}
        onClose={() => {
          setShortcuts('closed');
        }}
      />
      <Hints hints={hints} toolKind={toolKind} strings={strings} onDismiss={dismissHint} />
    </>
  );
}
