import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MetricsReport } from '@parkshape/core';

import { EDITOR_READY_MARK } from './test-hook';
import { useEditorReadyMark, type SceneReadiness } from './use-editor-ready';

// The hook only checks that a report exists, so any object stands in for one.
const report = {} as MetricsReport;

function readyMarks(): number {
  return performance.getEntriesByName(EDITOR_READY_MARK).length;
}

function renderReady(initial: { scene: SceneReadiness; report: MetricsReport | null }) {
  return renderHook(
    (props) => {
      useEditorReadyMark(props);
    },
    { initialProps: initial },
  );
}

describe('useEditorReadyMark', () => {
  afterEach(() => {
    performance.clearMarks(EDITOR_READY_MARK);
  });

  it('does not mark while the scene is still loading', () => {
    renderReady({ scene: 'loading', report });
    expect(readyMarks()).toBe(0);
  });

  it('does not mark before the first metrics report', () => {
    renderReady({ scene: 'ready', report: null });
    expect(readyMarks()).toBe(0);
  });

  it('marks once the scene is ready and the first report is in', () => {
    const view = renderReady({ scene: 'loading', report: null });
    view.rerender({ scene: 'ready', report: null });
    view.rerender({ scene: 'ready', report });
    expect(readyMarks()).toBe(1);
  });

  it('marks only once when later reports arrive', () => {
    const view = renderReady({ scene: 'ready', report });
    view.rerender({ scene: 'ready', report: { ...report } });
    expect(readyMarks()).toBe(1);
  });
});
