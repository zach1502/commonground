// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import type { WalkStrings } from './strings.js';
import { useWalkScene } from './use-walk-scene.js';
import { WalkEngine } from './walk-engine.js';
import type { WalkProps } from './walk-props.js';
import type { WalkCameraProps } from './WalkCamera.js';

// WalkCamera needs R3F. The stand-in hands over a real walk engine, as the camera does on mount.
vi.mock('./WalkCamera.js', () => {
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
  exit: 'Back to overview',
  next: 'Next entrance',
  mouseLook: 'Mouse look',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  run: 'Run',
  surface: 'Walk view',
  keys: 'Arrow keys walk.',
  touchKeys: 'Drag the pad to walk.',
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
const document = { items: [], paths: [], areas: [], water: [] };

interface ProbeProps {
  readonly walk: WalkProps;
  readonly ready: 'loading' | 'ready';
}

function WalkProbe({ walk, ready }: ProbeProps): ReactElement {
  const scene = useWalkScene(walk, { document, terrain, motion: 'full', ready });
  return (
    <>
      {scene.layer}
      {scene.overlay}
      {scene.startControl}
    </>
  );
}

afterEach(cleanup);

describe('useWalkScene with a start from the page', () => {
  it('waits for the scene, then starts the walk with no toolbar control', () => {
    const onModeChange = vi.fn();
    const walk: WalkProps = { parcel, strings, start: 'on-ready', onModeChange };
    const view = render(<WalkProbe walk={walk} ready="loading" />);
    expect(screen.queryByRole('button', { name: strings.exit })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.start })).toBeNull();
    view.rerender(<WalkProbe walk={walk} ready="ready" />);
    expect(screen.getByRole('button', { name: strings.exit })).toBeDefined();
    expect(onModeChange).toHaveBeenCalledWith('walk');
  });

  it('tells the page when the walk ends and does not start again by itself', () => {
    const onModeChange = vi.fn();
    const walk: WalkProps = { parcel, strings, start: 'on-ready', onModeChange };
    const view = render(<WalkProbe walk={walk} ready="ready" />);
    fireEvent.click(screen.getByRole('button', { name: strings.exit }));
    expect(onModeChange).toHaveBeenLastCalledWith('overview');
    view.rerender(<WalkProbe walk={walk} ready="ready" />);
    expect(screen.queryByRole('button', { name: strings.exit })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.start })).toBeNull();
  });

  it('keeps Walk the park in the toolbar by default', () => {
    render(<WalkProbe walk={{ parcel, strings }} ready="ready" />);
    expect(screen.getByRole('button', { name: strings.start })).toBeDefined();
    expect(screen.queryByRole('button', { name: strings.exit })).toBeNull();
  });
});
