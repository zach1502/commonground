import { Canvas } from '@react-three/fiber';
import type { ReactElement } from 'react';

import { cameraPreset, FIELD_OF_VIEW_DEG } from '../camera/presets.js';
import { renderFeatures } from '../perf/render-tier.js';

import { IslandScene } from './IslandScene.js';
import type { ViewerCanvasProps } from './viewer-props.js';

// DESIGN.md "Framing": near 1 m cuts z-fighting on path ribbons; far keeps the fogged skirt.
const NEAR_M = 1;
const FAR_M = 5000;

export type { DrawingBuffer, ViewerCanvasProps } from './viewer-props.js';

/** The WebGL canvas: renderer settings for the tier, and the island scene inside it. */
export function ViewerCanvas(props: ViewerCanvasProps): ReactElement {
  const { model } = props;
  const start = cameraPreset('reset', model.bounds).position;
  const { profile, decline } = props.renderProfile;
  const features = renderFeatures(profile);
  // The caller's choice wins: the dev page frame counter asks for 'always' to get a steady stream.
  const frameloop = props.frameloop ?? (features.frameloop === 'demand' ? 'demand' : 'always');
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, features.maxDpr]}
      shadows={features.shadows === 'map'}
      gl={{
        preserveDrawingBuffer: props.drawingBuffer === 'preserve',
        antialias: features.antialias === 'on',
      }}
      camera={{
        fov: FIELD_OF_VIEW_DEG,
        near: NEAR_M,
        far: FAR_M,
        position: [start.x, start.y, start.z],
      }}
    >
      <IslandScene {...props} profile={profile} features={features} onDecline={decline} />
    </Canvas>
  );
}
