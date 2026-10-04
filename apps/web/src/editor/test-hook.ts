import type { CanvasApi, EditorState, EditorStore } from '@parkshape/scene/editor';

/** Performance mark set once the editor can take a change without startup work in the way. */
export const EDITOR_READY_MARK = 'parkshape-editor-ready';

/** What the Playwright tests read from a test build. Never installed in a normal build. */
export interface EditorTestHook {
  readonly getState: () => EditorState;
  readonly screenPointOf: CanvasApi['screenPointOf'];
  /** The camera position and orbit target, or null before the canvas is up. */
  readonly cameraPose: () => ReturnType<CanvasApi['cameraPose']> | null;
}

declare global {
  interface Window {
    __parkshapeEditor?: EditorTestHook;
  }
}

export function installTestHook(
  store: EditorStore,
  canvas: { current: CanvasApi | null },
): () => void {
  window.__parkshapeEditor = {
    getState: () => store.getState(),
    screenPointOf: (point, liftM) => canvas.current?.screenPointOf(point, liftM) ?? null,
    cameraPose: () => canvas.current?.cameraPose() ?? null,
  };
  return () => {
    delete window.__parkshapeEditor;
  };
}
