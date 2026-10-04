// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { contextFor } from '../editor/actions/test-context.js';
import { docOf } from '../editor/test-fixtures.js';

import { sampleSiteContext } from './sample-context.js';
import { useEditorContextLayers, type EditorSiteContext } from './use-editor-context-layers.js';

afterEach(cleanup);

const parcel = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 60 },
  { x: 0, y: 60 },
];
const ready: EditorSiteContext = { load: { kind: 'ready', context: sampleSiteContext }, parcel };

describe('useEditorContextLayers', () => {
  it('hands the sidewalks to the entrance snap once the context is in', () => {
    const ctx = contextFor(docOf());
    const { result } = renderHook(() => useEditorContextLayers(ctx, ready));
    expect(ctx.store.getState().entranceSnap?.sidewalks.length).toBeGreaterThan(0);
    expect(result.current.layer?.streetNames).toBe('shown');
    expect(result.current.menu?.status).toBe('ready');
  });

  it('stops the snap when the sidewalk layer is turned off', () => {
    const ctx = contextFor(docOf());
    const { result } = renderHook(() => useEditorContextLayers(ctx, ready));
    act(() => {
      result.current.menu?.onToggle('sidewalk');
    });
    expect(ctx.store.getState().entranceSnap).toBeNull();
    expect(result.current.layer?.visible.sidewalk).toBe('off');
  });

  it('draws nothing and shows the failure in the menu when the context did not load', () => {
    const ctx = contextFor(docOf());
    const { result } = renderHook(() =>
      useEditorContextLayers(ctx, { load: { kind: 'failed' }, parcel }),
    );
    expect(result.current.layer).toBeUndefined();
    expect(result.current.menu?.status).toBe('failed');
    expect(ctx.store.getState().entranceSnap).toBeNull();
  });

  it('changes nothing in an editor with no site context', () => {
    const ctx = contextFor(docOf());
    const { result } = renderHook(() => useEditorContextLayers(ctx, undefined));
    expect(result.current.layer).toBeUndefined();
    expect(result.current.menu).toBeUndefined();
    expect(ctx.store.getState().entranceSnap).toBeNull();
  });
});
