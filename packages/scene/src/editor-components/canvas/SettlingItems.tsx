import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Matrix4 } from 'three';
import type { Group, Mesh, MeshBasicMaterial } from 'three';

import { instanceMatrix, type InstanceGroup } from '../../geometry/instances.js';
import {
  veilOpacity,
  type PlacementLook,
  type PlacementMotion,
} from '../../motion/placement-motion.js';
import type { MotionPreference } from '../../motion/rise.js';
import { usePlacementFrames } from '../../motion/use-placement-motion.js';
import type { ScenePalette } from '../../palette/colours.js';
import type { AssetManifest } from '../../types.js';

import {
  settlingModelParts,
  settlingPlaceholderParts,
  type SettlingPart,
} from './settling-parts.js';

interface SettlingBodyProps {
  readonly group: InstanceGroup;
  readonly parts: readonly SettlingPart[];
  readonly settle: SettleDrive;
}

interface SettleDrive {
  readonly motion: PlacementMotion;
  readonly preference: MotionPreference;
  readonly onDone: (serial: number) => void;
}

const placed = new Matrix4();

/** Every transform of one model, drawn as plain meshes with its own materials, moving together. */
function SettlingBody({ group, parts, settle }: SettlingBodyProps): ReactElement {
  const holders = useRef<(Group | null)[]>([]);
  const apply = useCallback(
    (look: PlacementLook) => {
      group.transforms.forEach((transform, index) => {
        const holder = holders.current[index];
        if (holder === undefined || holder === null) return;
        const lifted = {
          ...transform,
          position: { ...transform.position, y: transform.position.y + look.offsetM },
        };
        holder.matrix.copy(placed.fromArray(instanceMatrix(lifted)));
        holder.matrixWorldNeedsUpdate = true;
      });
    },
    [group],
  );
  usePlacementFrames({ ...settle, apply });
  return (
    <>
      {group.transforms.map((transform, index) => (
        <group
          key={index}
          ref={(node) => {
            holders.current[index] = node;
          }}
          matrixAutoUpdate={false}
          matrix={new Matrix4().fromArray(instanceMatrix(transform))}
        >
          {parts.map((part, partIndex) => (
            <mesh
              key={partIndex}
              geometry={part.geometry}
              material={part.material}
              matrix={part.matrix}
              matrixAutoUpdate={false}
            />
          ))}
        </group>
      ))}
    </>
  );
}

function ModelBody(
  props: Omit<SettlingBodyProps, 'parts'> & { readonly url: string },
): ReactElement {
  const { scene } = useGLTF(props.url);
  const parts = useMemo(() => settlingModelParts(scene), [scene]);
  return <SettlingBody group={props.group} parts={parts} settle={props.settle} />;
}

function PlaceholderBody(
  props: Omit<SettlingBodyProps, 'parts'> & { readonly palette: ScenePalette },
): ReactElement {
  const parts = useMemo(
    () => settlingPlaceholderParts(props.group.category, props.palette),
    [props.group, props.palette],
  );
  return <SettlingBody group={props.group} parts={parts} settle={props.settle} />;
}

/** The ghost-coloured box over one settling item, sized to its footprint and height. */
export interface SettleVeil {
  readonly x: number;
  readonly groundM: number;
  readonly z: number;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
  readonly rotationY: number;
}

const HALF = 0.5;

/** The ghost tint over each item, clearing as it lands; the ghost's material, so no new shader. */
function SettlingVeils(props: {
  readonly veils: readonly SettleVeil[];
  readonly colour: string;
  readonly settle: SettleDrive;
}): ReactElement {
  const boxes = useRef<(Mesh | null)[]>([]);
  const looks = useRef<(MeshBasicMaterial | null)[]>([]);
  const apply = useCallback(
    (look: PlacementLook) => {
      props.veils.forEach((veil, index) => {
        boxes.current[index]?.position.setY(veil.groundM + veil.heightM * HALF + look.offsetM);
        const material = looks.current[index];
        if (material !== null && material !== undefined) material.opacity = veilOpacity(look);
      });
    },
    [props.veils],
  );
  usePlacementFrames({ ...props.settle, apply });
  return (
    <>
      {props.veils.map((veil, index) => (
        <mesh
          key={index}
          ref={(node) => {
            boxes.current[index] = node;
          }}
          position={[veil.x, veil.groundM + veil.heightM * HALF, veil.z]}
          rotation-y={veil.rotationY}
          renderOrder={2}
        >
          <boxGeometry args={[veil.widthM, veil.heightM, veil.depthM]} />
          <meshBasicMaterial
            ref={(node) => {
              looks.current[index] = node;
            }}
            color={props.colour}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

export interface SettlingItemsProps {
  /** One instance group per model for the items that settle or lift, or null when none do. */
  readonly groups: ReadonlyMap<string, InstanceGroup> | null;
  readonly veils: readonly SettleVeil[];
  /** The ghost's valid colour, so the veil reads as the preview turning into the item. */
  readonly colour: string;
  readonly settle: SettleDrive | null;
  readonly palette: ScenePalette;
  readonly manifest?: AssetManifest | undefined;
}

/**
 * J17 and J18: the item just placed drops 0.15 m onto the ground while the ghost tint over it
 * clears from the ghost's 0.5 opacity, and an undo lifts it 0.15 m as the tint returns. The
 * instanced draw leaves these items out until the motion ends.
 */
export function SettlingItems(props: SettlingItemsProps): ReactElement | null {
  const { groups, settle, palette, manifest } = props;
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [settle, invalidate]);
  if (groups === null || settle === null) return null;
  return (
    <Suspense fallback={null}>
      {[...groups.values()].map((group) => {
        const url = manifest?.[group.modelKey]?.url;
        const key = `${String(settle.motion.serial)}-${group.modelKey}`;
        return url === undefined ? (
          <PlaceholderBody key={key} group={group} palette={palette} settle={settle} />
        ) : (
          <ModelBody key={key} group={group} url={url} settle={settle} />
        );
      })}
      <SettlingVeils
        key={`veils-${String(settle.motion.serial)}`}
        veils={props.veils}
        colour={props.colour}
        settle={settle}
      />
    </Suspense>
  );
}
