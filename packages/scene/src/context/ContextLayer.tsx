import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { BufferAttribute, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Material } from 'three';

import type { Heightmap, SiteContext } from '@parkshape/core';

import { useBufferGeometry } from '../components/use-buffer-geometry.js';
import { useDisposable } from '../components/use-disposable.js';
import { useHatchMaterial } from '../editor-components/canvas/hatch-material.js';
import { VECTOR_SIZE } from '../geometry/vector-layout.js';
import type { ScenePalette } from '../palette/colours.js';
import type { MeshArrays } from '../types.js';

import { buildApron } from './apron.js';
import { buildContextMeshes, type ContextLineKind } from './context-geometry.js';
import { BusStopPins, StreetNames } from './ContextLabels.js';
import { contextDrawPlan, type ContextVisibility } from './layer-plan.js';

/** What a page hands the viewer or editor to draw the streets around the park. */
export interface ContextLayerInput {
  readonly context: SiteContext;
  readonly visible: ContextVisibility;
  /** The editor and design page name the streets; the vote card leaves them off. */
  readonly streetNames: 'shown' | 'hidden';
}

export interface ContextLayerProps extends ContextLayerInput {
  readonly heightmap: Heightmap;
  readonly palette: ScenePalette;
}

// Matte everywhere, so the design's own surfaces read above the context.
const MATTE = { roughness: 1, metalness: 0 } as const;
// Pulls each later layer toward the camera in the depth test, over the apron and the streets.
const DEPTH_NUDGE: Readonly<Record<ContextLineKind, number>> = {
  street: -1,
  sidewalk: -2,
  bikeway: -3,
};

function lineMaterial(colour: string, kind: ContextLineKind): MeshStandardMaterial {
  return new MeshStandardMaterial({
    ...MATTE,
    color: colour,
    polygonOffset: true,
    polygonOffsetFactor: DEPTH_NUDGE[kind],
    polygonOffsetUnits: DEPTH_NUDGE[kind],
  });
}

function GroundMesh({
  arrays,
  material,
}: {
  readonly arrays: MeshArrays;
  readonly material: Material;
}): ReactElement {
  const geometry = useBufferGeometry(arrays);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function useApronGeometry(heightmap: Heightmap, palette: ScenePalette): BufferGeometry {
  const apron = useMemo(() => buildApron(heightmap, palette), [heightmap, palette]);
  const geometry = useBufferGeometry(apron);
  useLayoutEffect(() => {
    geometry.setAttribute('color', new BufferAttribute(apron.colours, VECTOR_SIZE));
  }, [geometry, apron]);
  return geometry;
}

function Apron({ heightmap, palette }: Pick<ContextLayerProps, 'heightmap' | 'palette'>) {
  const geometry = useApronGeometry(heightmap, palette);
  const [material] = useDisposable(
    () => [new MeshStandardMaterial({ ...MATTE, vertexColors: true })],
    [],
  );
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function ParkingStalls({
  arrays,
  colour,
}: {
  readonly arrays: MeshArrays;
  readonly colour: string;
}) {
  const material = useHatchMaterial(colour);
  return <GroundMesh arrays={arrays} material={material} />;
}

/**
 * The streets, sidewalks, parking, bike routes and bus stops around the parcel, on a flat apron
 * that eases into the parcel edge. Nothing here can be selected; only a bus stop pin answers
 * the pointer, by naming the stop.
 */
export function ContextLayer(props: ContextLayerProps): ReactElement {
  const { context, heightmap, palette, visible } = props;
  const meshes = useMemo(() => buildContextMeshes(context, heightmap), [context, heightmap]);
  const materials = useDisposable(
    () =>
      [
        lineMaterial(palette.contextStreet, 'street'),
        lineMaterial(palette.contextSidewalk, 'sidewalk'),
        lineMaterial(palette.contextAccent, 'bikeway'),
      ] as const,
    [palette],
  );
  const [street, sidewalk, bikeway] = materials;
  const kinds = contextDrawPlan(meshes, visible);
  const plan = new Set(kinds);
  // The editor draws on demand, and a removed mesh asks for no frame of its own.
  const invalidate = useThree((state) => state.invalidate);
  const planKey = kinds.join(' ');
  useEffect(() => {
    invalidate();
  }, [invalidate, planKey]);
  return (
    <group name="context-layer">
      {plan.has('apron') ? <Apron heightmap={heightmap} palette={palette} /> : null}
      {plan.has('street') ? <GroundMesh arrays={meshes.lines.street} material={street} /> : null}
      {plan.has('sidewalk') ? (
        <GroundMesh arrays={meshes.lines.sidewalk} material={sidewalk} />
      ) : null}
      {plan.has('parking') ? (
        <ParkingStalls arrays={meshes.parking} colour={palette.contextParking} />
      ) : null}
      {plan.has('bikeway') ? <GroundMesh arrays={meshes.lines.bikeway} material={bikeway} /> : null}
      {plan.has('busStop') ? (
        <BusStopPins stops={meshes.busStops} colour={palette.contextAccent} />
      ) : null}
      {plan.has('street') && props.streetNames === 'shown' ? (
        <StreetNames labels={meshes.labels} />
      ) : null}
    </group>
  );
}
