// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { EditorContext } from '../../editor/actions/context.js';
import { pointerSelect } from '../../editor/actions/selecting.js';
import { contextFor } from '../../editor/actions/test-context.js';
import { docOf, treeInput } from '../../editor/test-fixtures.js';

import { useEditorKeys } from './use-editor-keys.js';

function Probe({ ctx }: { readonly ctx: EditorContext }): ReactElement | null {
  useEditorKeys(ctx);
  return null;
}

function withTree() {
  return contextFor(docOf({ items: [treeInput('t1', 10, 10)] }));
}

const itemPosition = (ctx: EditorContext) => ctx.store.getState().document.items[0]?.position;

describe('useEditorKeys arrow nudge', () => {
  it('moves a selected item by one grid step on a plain arrow key', () => {
    const ctx = withTree();
    render(<Probe ctx={ctx} />);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(itemPosition(ctx)?.x).toBeCloseTo(10.5);
  });

  it('takes a larger step when Shift is held', () => {
    const ctx = withTree();
    render(<Probe ctx={ctx} />);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
    expect(itemPosition(ctx)?.x).toBeCloseTo(12.5);
  });

  it('leaves the document alone with nothing selected, so the camera takes the key', () => {
    const ctx = withTree();
    render(<Probe ctx={ctx} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(itemPosition(ctx)).toEqual({ x: 10, y: 10 });
  });
});
