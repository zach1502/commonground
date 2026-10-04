import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { BoxGeometry, CylinderGeometry, Matrix4, MeshStandardMaterial } from 'three';
import type { InstancedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { useDisposable } from '../components/use-disposable.js';
import { HALF } from '../geometry/vector-layout.js';

import type { BusStopPin, StreetLabel } from './context-geometry.js';

// DESIGN.md Context: a bus stop is a pin 0.3 m wide and 2.5 m tall, a pole with a sign on top.
const PIN = { widthM: 0.3, heightM: 2.5, signM: 0.3, signDepthM: 0.04, poleRadiusM: 0.04 } as const;
const POLE_SEGMENTS = 8;
// The stop name floats just above the sign.
const LABEL_ABOVE_PIN_M = 0.4;
// Street names sit a little above the street, under every editor label.
const STREET_LABEL_LIFT_M = 0.3;
// drei Html z-index range: street names stack under the editor's own labels.
const LABEL_Z_INDEX_TOP = 10;
const LABEL_LAYERS: [number, number] = [LABEL_Z_INDEX_TOP, 0];
const ICON_PX = 16;

const labelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--layout-margin-xsmall)',
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-white)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
  borderRadius: 'var(--layout-border-radius-small)',
  padding: '0 var(--layout-padding-xsmall)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

const streetNameStyle: CSSProperties = {
  font: 'var(--typography-regular-small-body)',
  color: 'var(--typography-color-secondary)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

/** A bus drawn in outline at the 16 px inline icon size, in the line style of the alert icons. */
function BusIcon(): ReactElement {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3.75" y="2.75" width="12.5" height="12" rx="2" />
      <path d="M3.75 9.25h12.5M6.5 14.75v2.5M13.5 14.75v2.5" />
    </svg>
  );
}

function pinGeometry() {
  const poleHeight = PIN.heightM - PIN.signM;
  const pole = new CylinderGeometry(PIN.poleRadiusM, PIN.poleRadiusM, poleHeight, POLE_SEGMENTS);
  pole.translate(0, poleHeight * HALF, 0);
  const sign = new BoxGeometry(PIN.widthM, PIN.signM, PIN.signDepthM);
  sign.translate(0, PIN.heightM - PIN.signM * HALF, 0);
  const merged = mergeGeometries([pole, sign]);
  pole.dispose();
  sign.dispose();
  return merged;
}

export interface BusStopPinsProps {
  readonly stops: readonly BusStopPin[];
  readonly colour: string;
}

/** Every bus stop as one instanced pin; hovering or tapping a pin names the stop. */
export function BusStopPins({ stops, colour }: BusStopPinsProps): ReactElement {
  const ref = useRef<InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [geometry, material] = useDisposable(
    () => [pinGeometry(), new MeshStandardMaterial({ color: colour, roughness: 1, metalness: 0 })],
    [colour],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) return;
    const matrix = new Matrix4();
    stops.forEach((stop, index) => {
      mesh.setMatrixAt(
        index,
        matrix.makeTranslation(stop.position.x, stop.position.y, stop.position.z),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [stops]);
  const shown = stops[hovered ?? selected ?? -1];
  const pick = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.instanceId ?? null;
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[geometry, material, stops.length]}
        onPointerOver={(event) => {
          setHovered(pick(event));
        }}
        onPointerOut={() => {
          setHovered(null);
        }}
        onClick={(event) => {
          const index = pick(event);
          setSelected((current) => (current === index ? null : index));
        }}
      />
      {shown === undefined ? null : (
        <Html
          position={[
            shown.position.x,
            shown.position.y + PIN.heightM + LABEL_ABOVE_PIN_M,
            shown.position.z,
          ]}
          center
          zIndexRange={LABEL_LAYERS}
          pointerEvents="none"
        >
          <span style={labelStyle} data-context-label="bus-stop">
            <BusIcon />
            <span data-kind="data">{shown.name}</span>
          </span>
        </Html>
      )}
    </>
  );
}

/** Up to 6 street names on the ground beside the parcel; they are data, not chrome. */
export function StreetNames({ labels }: { readonly labels: readonly StreetLabel[] }): ReactElement {
  return (
    <>
      {labels.map((label) => (
        <Html
          key={label.name}
          position={[label.position.x, label.position.y + STREET_LABEL_LIFT_M, label.position.z]}
          center
          zIndexRange={LABEL_LAYERS}
          pointerEvents="none"
        >
          <span style={streetNameStyle} data-kind="data" data-context-label="street">
            {label.name}
          </span>
        </Html>
      ))}
    </>
  );
}
