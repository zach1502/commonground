import { useEffect, useRef } from 'react';

import type { MetricsReport } from '@parkshape/core';

import { EDITOR_READY_MARK } from './test-hook';

export type SceneReadiness = 'loading' | 'ready';

export interface EditorReadiness {
  readonly scene: SceneReadiness;
  readonly report: MetricsReport | null;
}

/**
 * Marks the moment the editor is ready for a change: the scene has loaded with its overlay
 * shaders compiled, and the first metrics report is in. Latency probes start after this mark.
 */
export function useEditorReadyMark({ scene, report }: EditorReadiness): void {
  const marked = useRef<'waiting' | 'marked'>('waiting');
  useEffect(() => {
    if (marked.current === 'marked' || scene !== 'ready' || report === null) return;
    marked.current = 'marked';
    if (typeof performance !== 'undefined') performance.mark(EDITOR_READY_MARK);
  }, [scene, report]);
}
