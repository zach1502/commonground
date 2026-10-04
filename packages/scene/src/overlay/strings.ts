/** Viewer text; apps pass it in from their locale files. */
export interface ViewerStrings {
  /** Accessible name of the 3D canvas, for example "3D view of the park design". */
  readonly canvasLabel: string;
  readonly viewControls: string;
  readonly resetView: string;
  readonly topDown: string;
  readonly birdsEye: string;
  readonly compareWithToday: string;
  /** Names the data source, for example "Loading terrain from NRCan HRDEM". */
  readonly loadingMessage: string;
}
