import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Box3, OrthographicCamera } from 'three';
import type { DirectionalLight } from 'three';

import { InstancedItems } from '../components/InstancedItems.js';
import { SceneLights } from '../components/SceneLights.js';
import type { SceneBounds } from '../geometry/sample.js';
import { QUARTER_TURN } from '../geometry/vector-layout.js';
import { documentPropertyReader, readPalette } from '../palette/colours.js';

import { CATALOG_THUMBNAIL_SETTINGS, catalogThumbnailView } from './framing.js';

export interface CatalogThumbnailProps {
  readonly modelKey: string;
  readonly url: string;
  /** Called once the model has drawn with its shadow, so the canvas can be read. */
  readonly onReady: () => void;
}

// Frames drawn after the model mounts: the environment map, the shadow map, then the picture.
const READY_FRAMES = 4;
const NEAR_M = 1;
const FAR_M = 400;
// A shadow-only ground: the picture stays transparent and only the cast shadow shows on it.
const GROUND_SIDE_M = 200;
const SHADOW_OPACITY = 0.3;
const START_DISTANCE_M = 200;

function boundsOf(box: Box3): SceneBounds {
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
}

function useFramedCamera(bounds: SceneBounds) {
  const camera = useThree((state) => state.camera);
  const view = useMemo(() => catalogThumbnailView(bounds), [bounds]);
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    const half = view.halfSizeM;
    Object.assign(camera, { left: -half, right: half, top: half, bottom: -half, zoom: 1 });
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    camera.updateProjectionMatrix();
  }, [camera, view]);
  return view;
}

/** The model on a shadow-only ground, framed and lit as every other catalog picture. */
function FramedModel({ modelKey, url, onReady }: CatalogThumbnailProps): ReactElement {
  const { scene } = useGLTF(url);
  const bounds = useMemo(() => {
    scene.updateMatrixWorld(true);
    return boundsOf(new Box3().setFromObject(scene));
  }, [scene]);
  const view = useFramedCamera(bounds);
  const palette = useMemo(() => readPalette(documentPropertyReader()), []);
  const groups = useMemo(
    () =>
      new Map([
        [
          modelKey,
          {
            modelKey,
            category: 'other' as const,
            transforms: [{ position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 }],
          },
        ],
      ]),
    [modelKey],
  );
  const sunRef = useRef<DirectionalLight>(null);
  const frames = useRef(0);
  useFrame(() => {
    const sun = sunRef.current;
    if (sun !== null) sun.shadow.needsUpdate = true;
    frames.current += 1;
    if (frames.current === READY_FRAMES) onReady();
  });
  return (
    <>
      <SceneLights
        bounds={bounds}
        palette={palette}
        fill="environment"
        shadowMapPx={CATALOG_THUMBNAIL_SETTINGS.shadowMapPx}
        sunRef={sunRef}
        headingRad={view.headingRad}
        shadowHalfSideM={view.shadowHalfSideM}
        sunElevationRad={view.sunElevationRad}
      />
      <InstancedItems groups={groups} palette={palette} manifest={{ [modelKey]: { url } }} />
      <mesh rotation-x={-QUARTER_TURN} receiveShadow>
        <planeGeometry args={[GROUND_SIDE_M, GROUND_SIDE_M]} />
        <shadowMaterial transparent opacity={SHADOW_OPACITY} />
      </mesh>
    </>
  );
}

/**
 * A square transparent canvas with one catalog model: the scene's GLB loader, materials and light
 * rig, under one orthographic camera. The asset pipeline reads it into a PNG.
 */
export function CatalogThumbnailCanvas(props: CatalogThumbnailProps): ReactElement {
  return (
    <Canvas
      orthographic
      frameloop="always"
      dpr={1}
      shadows
      gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
      camera={{ near: NEAR_M, far: FAR_M, position: [0, 0, START_DISTANCE_M] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Suspense fallback={null}>
        <FramedModel {...props} />
      </Suspense>
    </Canvas>
  );
}
