import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, MeshStandardMaterial } from 'three';
import type { IUniform, InstancedMesh } from 'three';

import { createSeededRandom } from '@parkshape/core';

import { birdFlights } from '../geometry/dressing.js';
import { centreOf } from '../geometry/sample.js';
import type { SceneBounds } from '../geometry/sample.js';
import { FULL_TURN, QUARTER_TURN } from '../geometry/vector-layout.js';
import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';

import { useDisposable } from './use-disposable.js';

const BIRD_SEED = 34;
// A 0.8 m wingspan V with a short body: two triangles, one per wing.
const HALF_SPAN_M = 0.4;
const NOSE_M = 0.2;
const TAIL_M = -0.1;
const WING_VERTICES = [
  ...[0, 0, NOSE_M, -HALF_SPAN_M, 0, TAIL_M, 0, 0, TAIL_M],
  ...[0, 0, NOSE_M, 0, 0, TAIL_M, HALF_SPAN_M, 0, TAIL_M],
];
const VECTOR_SIZE = 3;
const FLAP_RATE = 9;
const FLAP_LIFT = 0.5;
const FLAP = `#include <begin_vertex>
	transformed.y += abs( position.x ) * sin( uFlapTime * ${FLAP_RATE.toFixed(1)} ) * ${FLAP_LIFT.toFixed(1)};`;

function birdGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(WING_VERTICES), VECTOR_SIZE),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export interface BirdsProps {
  readonly bounds: SceneBounds;
  readonly palette: ScenePalette;
  readonly motion: MotionPreference;
}

/** A few birds circling the parcel, one instanced draw; the wings flap in the vertex shader. */
export function Birds({ bounds, palette, motion }: BirdsProps): ReactElement | null {
  const flights = useMemo(
    () => birdFlights({ random: createSeededRandom(BIRD_SEED), motion }),
    [motion],
  );
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const time = useMemo<IUniform<number>>(() => ({ value: 0 }), []);
  const [geometry, material] = useDisposable(() => {
    const ink = new MeshStandardMaterial({
      color: palette.soilDark,
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
    });
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.uFlapTime = time;
      shader.vertexShader = `uniform float uFlapTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        FLAP,
      );
    };
    return [birdGeometry(), ink] as const;
  }, [palette, time]);
  const centre = centreOf(bounds);
  const matrix = useMemo(() => new Matrix4(), []);
  useLayoutEffect(() => {
    mesh.current?.computeBoundingSphere();
  }, []);
  useFrame(({ clock }) => {
    const current = mesh.current;
    if (current === null) return;
    time.value = clock.elapsedTime;
    flights.forEach((flight, index) => {
      const angle = flight.phase + (clock.elapsedTime / flight.lapS) * FULL_TURN;
      matrix.makeRotationY(-angle - QUARTER_TURN);
      matrix.setPosition(
        centre.x + Math.cos(angle) * flight.radiusM,
        bounds.maxY + flight.heightM,
        centre.z + Math.sin(angle) * flight.radiusM,
      );
      current.setMatrixAt(index, matrix);
    });
    current.instanceMatrix.needsUpdate = true;
    invalidate();
  });
  if (flights.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, flights.length]}
      frustumCulled={false}
      castShadow={false}
    />
  );
}
