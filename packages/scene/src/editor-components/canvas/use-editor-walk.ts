import { useMemo, useRef, useState } from 'react';

import type { EditorContext } from '../../editor/actions/context.js';
import type { Tool } from '../../editor/store/types.js';
import type { WalkProps } from '../../walk/walk-props.js';

export interface EditorWalk {
  readonly mode: 'overview' | 'walk';
  /** The walk props with the editor's own mode change wrapped in, or undefined without a walk. */
  readonly walk: WalkProps | undefined;
}

/**
 * The park walk inside the editor. Starting it parks the active tool on Select, so no tap or key
 * edits the design while walking; leaving it gives the tool back.
 */
export function useEditorWalk(ctx: EditorContext, walk: WalkProps | undefined): EditorWalk {
  const [mode, setMode] = useState<'overview' | 'walk'>('overview');
  const paused = useRef<Tool | null>(null);
  const editorWalk = useMemo(() => {
    if (walk === undefined) return undefined;
    const onModeChange = (next: 'overview' | 'walk') => {
      const state = ctx.store.getState();
      if (next === 'walk') {
        paused.current = state.tool;
        state.setTool({ kind: 'select' });
      } else if (paused.current !== null) {
        state.setTool(paused.current);
        paused.current = null;
      }
      setMode(next);
      walk.onModeChange?.(next);
    };
    return { ...walk, onModeChange };
  }, [ctx, walk]);
  return { mode, walk: editorWalk };
}
