// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditorContext } from '../../editor/actions/context.js';
import { contextFor } from '../../editor/actions/test-context.js';
import { docOf, treeInput } from '../../editor/test-fixtures.js';
import { heightmapFrom } from '../../geometry/synthetic-heightmap.js';
import type { WalkStrings } from '../../walk/strings.js';
import { useWalkScene } from '../../walk/use-walk-scene.js';
import { WalkEngine } from '../../walk/walk-engine.js';
import type { WalkCameraProps } from '../../walk/WalkCamera.js';

import { useEditorKeys } from './use-editor-keys.js';
import { useEditorWalk } from './use-editor-walk.js';

// WalkCamera needs R3F. The stand-in hands over a real walk engine, as the camera does on mount.
vi.mock('../../walk/WalkCamera.js', () => {
  const WalkCamera = ({ parcel, heightmap, onEngine }: WalkCameraProps) => {
    useEffect(() => {
      const start = { position: { x: 30, z: 2 }, headingRad: 0, kind: 'entrance' as const };
      onEngine(new WalkEngine({ world: { heightmap, parcel }, starts: [start], motion: 'full' }));
    }, [heightmap, parcel, onEngine]);
    return null;
  };
  return { WalkCamera };
});

const strings: WalkStrings = {
  start: 'Walk the park',
  exit: 'Back to editing',
  next: 'Next entrance',
  mouseLook: 'Mouse look',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  run: 'Run',
  surface: 'Walk view',
  keys: 'Arrow keys or W, A, S and D walk. Shift or Run turns running on and off. Drag to look around.',
  touchKeys: 'Drag the round pad to walk. Tap Run to go faster. Drag the view to look around.',
  joystick: 'Walk pad',
  startAt: 'Entrance {index} of {count}',
  near: 'Near {label}, {n} m ahead',
};
const parcel = [
  { x: 0, z: 0 },
  { x: 60, z: 0 },
  { x: 60, z: 60 },
  { x: 0, z: 60 },
];
const terrain = heightmapFrom({ width: 61, height: 61, resolutionM: 1 }, () => 5);
const walkProps = { parcel, strings };

/** The editor's walk wiring as ParkEditor and the canvas compose it, without the 3D canvas. */
function EditorWalkProbe({ ctx }: { readonly ctx: EditorContext }): ReactElement {
  const editorWalk = useEditorWalk(ctx, walkProps);
  useEditorKeys(ctx, editorWalk.mode);
  const document = { items: [], paths: [], areas: [], water: [] };
  const walk = useWalkScene(editorWalk.walk, { document, terrain, motion: 'full' });
  return (
    <>
      {walk.layer}
      {walk.overlay}
      {walk.startControl}
    </>
  );
}

function placing() {
  const ctx = contextFor(docOf({ items: [treeInput('t1', 10, 10)] }));
  ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
  render(<EditorWalkProbe ctx={ctx} />);
  return ctx;
}

const toolKind = (ctx: EditorContext) => ctx.store.getState().tool.kind;

afterEach(cleanup);

describe('Walk the park in the editor', () => {
  it('pauses the editing tool and the editor shortcuts while walking', () => {
    const ctx = placing();
    fireEvent.click(screen.getByRole('button', { name: strings.start }));
    expect(toolKind(ctx)).toBe('select');
    expect(screen.getByRole('button', { name: strings.exit })).toBeDefined();
    // P picks the path tool in the editor; during the walk it does nothing.
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(toolKind(ctx)).toBe('select');
  });

  it('gives the tool back on Back to editing and returns focus to Walk the park', () => {
    const ctx = placing();
    fireEvent.click(screen.getByRole('button', { name: strings.start }));
    fireEvent.click(screen.getByRole('button', { name: strings.exit }));
    expect(ctx.store.getState().tool).toEqual({ kind: 'place', catalogId: 'bench' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: strings.start }));
  });

  it('gives the tool back on Escape', () => {
    const ctx = placing();
    fireEvent.click(screen.getByRole('button', { name: strings.start }));
    act(() => {
      fireEvent.keyDown(screen.getByRole('application', { name: strings.surface }), {
        key: 'Escape',
      });
    });
    expect(toolKind(ctx)).toBe('place');
    expect(screen.queryByRole('button', { name: strings.exit })).toBeNull();
  });
});
