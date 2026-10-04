import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  DodecahedronGeometry,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { BufferGeometry, Group } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Heightmap } from '@parkshape/core';
import { createSeededRandom } from '@parkshape/core';

import { CLUTTER_HIDE_BEYOND_M, dressingLayout, FIGURE_PARTS } from '../geometry/dressing.js';
import type { ClutterKind, DressingLayout } from '../geometry/dressing.js';
import type { InstanceGroup } from '../geometry/instances.js';
import { centreOf } from '../geometry/sample.js';
import type { SceneBounds } from '../geometry/sample.js';
import { linearRgb } from '../geometry/terrain-colours.js';
import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';
import type { RenderFeatures } from '../perf/render-tier.js';
import type { ParkDocument } from '../types.js';

import { Birds } from './Birds.js';
import { InstancedPart } from './InstancedPart.js';
import { useDisposable } from './use-disposable.js';

// A fixed seed, so the same design always shows the same people and pebbles.
const DRESSING_SEED = 21;
const HALF = 0.5;
const VECTOR_SIZE = 3;
const ROCK_RADIUS_M = 0.25;
const TUFT = { radiusM: 0.18, heightM: 0.35, sides: 5 };
const FIGURE_ROUGHNESS = 0.8;
const CLUTTER_ROUGHNESS = 0.95;

/** The three stacked blocks of a person, merged with a colour per block. */
function figureGeometry(palette: ScenePalette): BufferGeometry {
  let base = 0;
  const blocks = FIGURE_PARTS.map((part) => {
    const block = new BoxGeometry(part.widthM, part.heightM, part.depthM).translate(
      0,
      base + part.heightM * HALF,
      0,
    );
    base += part.heightM;
    const rgb = linearRgb(palette[part.colour]);
    const count = block.getAttribute('position').count;
    const colours = new Float32Array(count * VECTOR_SIZE);
    for (let v = 0; v < count; v += 1) colours.set(rgb, v * VECTOR_SIZE);
    block.setAttribute('color', new BufferAttribute(colours, VECTOR_SIZE));
    return block;
  });
  const merged = mergeGeometries(blocks);
  blocks.forEach((block) => {
    block.dispose();
  });
  return merged;
}

function clutterGeometry(kind: ClutterKind): BufferGeometry {
  return kind === 'rock'
    ? new DodecahedronGeometry(ROCK_RADIUS_M).translate(0, ROCK_RADIUS_M * HALF, 0)
    : new ConeGeometry(TUFT.radiusM, TUFT.heightM, TUFT.sides).translate(0, TUFT.heightM * HALF, 0);
}

/** Hides the clutter when the camera is far away, where it would only add noise. */
function useFarHide(bounds: SceneBounds) {
  const group = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const centre = useMemo(() => {
    const middle = centreOf(bounds);
    return new Vector3(middle.x, middle.y, middle.z);
  }, [bounds]);
  useFrame(() => {
    if (group.current === null) return;
    const distance = camera.position.distanceTo(centre);
    group.current.visible = distance <= CLUTTER_HIDE_BEYOND_M;
  });
  return group;
}

export interface DressingProps {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly groups: ReadonlyMap<string, InstanceGroup>;
  readonly palette: ScenePalette;
  readonly bounds: SceneBounds;
  readonly features: RenderFeatures;
  readonly motion: MotionPreference;
}

/**
 * Figures for scale, clutter under the trees and birds overhead. None of it can be selected
 * or counts in the meters; the phone tier keeps only the figures.
 */
function useDressingLayout(props: DressingProps) {
  const { heightmap, document, groups } = props;
  return useMemo(() => {
    const trees = [...groups.values()]
      .filter((group) => group.category === 'tree')
      .flatMap((group) => group.transforms.map((transform) => transform.position));
    return dressingLayout({
      heightmap,
      document,
      trees,
      random: createSeededRandom(DRESSING_SEED),
    });
  }, [heightmap, document, groups]);
}

function clutterInk(colour: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: colour,
    roughness: CLUTTER_ROUGHNESS,
    metalness: 0,
    flatShading: true,
  });
}

interface ClutterProps {
  readonly clutter: DressingLayout['clutter'];
  readonly palette: ScenePalette;
  readonly bounds: SceneBounds;
}

/** Rocks and grass tufts under the trees: no shadow, one draw per kind, hidden from far away. */
function Clutter({ clutter, palette, bounds }: ClutterProps): ReactElement {
  const [rock, tuft, rockInk, tuftInk] = useDisposable(
    () =>
      [
        clutterGeometry('rock'),
        clutterGeometry('tuft'),
        clutterInk(palette.soil),
        clutterInk(palette.foliage),
      ] as const,
    [palette],
  );
  const far = useFarHide(bounds);
  const looks = { rock: [rock, rockInk], tuft: [tuft, tuftInk] } as const;
  return (
    <group ref={far}>
      {clutter.map((group) => (
        <InstancedPart
          key={`${group.kind}-${String(group.transforms.length)}`}
          geometry={looks[group.kind][0]}
          material={looks[group.kind][1]}
          transforms={group.transforms}
          shadow="receive"
        />
      ))}
    </group>
  );
}

/**
 * Figures for scale, clutter under the trees and birds overhead. None of it can be selected
 * or counts in the meters; the phone tier keeps only the figures.
 */
export function Dressing(props: DressingProps): ReactElement {
  const { palette, features } = props;
  const layout = useDressingLayout(props);
  const [figure, figureInk] = useDisposable(
    () =>
      [
        figureGeometry(palette),
        new MeshStandardMaterial({ vertexColors: true, roughness: FIGURE_ROUGHNESS, metalness: 0 }),
      ] as const,
    [palette],
  );
  return (
    <>
      {layout.figures.length === 0 ? null : (
        <InstancedPart
          key={`figures-${String(layout.figures.length)}`}
          geometry={figure}
          material={figureInk}
          transforms={layout.figures}
        />
      )}
      {features.dressing === 'full' ? (
        <>
          <Clutter clutter={layout.clutter} palette={palette} bounds={props.bounds} />
          <Birds bounds={props.bounds} palette={palette} motion={props.motion} />
        </>
      ) : null}
    </>
  );
}
