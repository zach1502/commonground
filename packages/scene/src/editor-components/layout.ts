/**
 * The editor's three columns: tools, the 3D canvas and details. The side columns take a share
 * of the container between a smallest readable width and their full-page width, so an editor
 * embedded in a narrower page column, such as wizard step 5, keeps most of its width for the
 * canvas. No width is fixed in pixels; the app decides the container size.
 */
interface SideColumn {
  readonly minRem: number;
  readonly share: number;
  readonly maxRem: number;
}

const TOOLS: SideColumn = { minRem: 13, share: 0.2, maxRem: 18 };
const DETAILS: SideColumn = { minRem: 15, share: 0.225, maxRem: 20 };
// The open Items list needs one line per row for a name such as "Western red cedar, south-east
// corner (1 of 8)" beside its Locked tag, so the column widens while the list is open.
const DETAILS_WITH_LIST: SideColumn = { minRem: 15, share: 0.32, maxRem: 28 };

/** The details column's width: standard, or wide while the Items list is open. */
export type DetailsWidth = 'standard' | 'list';

const detailsOf = (width: DetailsWidth): SideColumn =>
  width === 'list' ? DETAILS_WITH_LIST : DETAILS;
const PERCENT = 100;
// The root font size the B.C. Design System tokens assume, for the pixel check only.
const ROOT_FONT_PX = 16;

const clampOf = (column: SideColumn): string =>
  `clamp(${String(column.minRem)}rem, ${String(column.share * PERCENT)}%, ${String(column.maxRem)}rem)`;

/** The grid columns for the editor, with the details column at the given width. */
export function editorColumns(details: DetailsWidth): string {
  return `${clampOf(TOOLS)} minmax(0, 1fr) ${clampOf(detailsOf(details))}`;
}

export const EDITOR_COLUMNS = editorColumns('standard');

const widthOf = (column: SideColumn, containerPx: number, remPx: number): number =>
  Math.min(Math.max(containerPx * column.share, column.minRem * remPx), column.maxRem * remPx);

/** The pixel widths EDITOR_COLUMNS resolves to in a container, as the browser works them out. */
export function editorColumnWidths(
  containerPx: number,
  options: { readonly remPx?: number; readonly details?: DetailsWidth } = {},
): { readonly tools: number; readonly canvas: number; readonly details: number } {
  const remPx = options.remPx ?? ROOT_FONT_PX;
  const tools = widthOf(TOOLS, containerPx, remPx);
  const details = widthOf(detailsOf(options.details ?? 'standard'), containerPx, remPx);
  return { tools, details, canvas: Math.max(containerPx - tools - details, 0) };
}
