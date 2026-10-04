import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';

import type { Heightmap } from '@parkshape/core';

import { elevationAt } from '../geometry/sample.js';
import type { GroundPoint } from '../types.js';

import { pagePointOf } from './page-point.js';

interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What a test build reads from the read-only viewer, to tap an element and check the camera. */
export interface ViewerProbe {
  /** Page coordinates of a ground point, or of the spot liftM metres above it; null behind. */
  readonly screenPointOf: (
    point: GroundPoint,
    liftM?: number,
  ) => { readonly x: number; readonly y: number } | null;
  /**
   * Where the camera is, the unit direction it faces and the point the orbit aims at; no aim
   * while the walk drives the camera.
   */
  readonly cameraPose: () => {
    readonly position: Spot;
    readonly facing: Spot;
    readonly target: Spot | null;
  };
}

interface AimControls {
  readonly target?: Spot;
}

export interface ViewerProbeBridgeProps {
  readonly terrain: Heightmap;
  readonly onProbe: (probe: ViewerProbe) => void;
}

/** Hands the probe to the page once the canvas is up, and again when the camera or ground change. */
export function ViewerProbeBridge({ terrain, onProbe }: ViewerProbeBridgeProps): null {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const controls = useThree((state) => state.controls) as AimControls | null;
  useEffect(() => {
    onProbe({
      screenPointOf: (point, liftM = 0) => {
        const world = { x: point.x, y: elevationAt(terrain, point) + liftM, z: point.z };
        return pagePointOf(world, camera, canvas.getBoundingClientRect());
      },
      cameraPose: () => {
        const { x, y, z } = camera.position;
        const facing = camera.getWorldDirection(new Vector3());
        const aim = controls?.target;
        return {
          position: { x, y, z },
          facing: { x: facing.x, y: facing.y, z: facing.z },
          target: aim === undefined ? null : { x: aim.x, y: aim.y, z: aim.z },
        };
      },
    });
  }, [camera, canvas, controls, terrain, onProbe]);
  return null;
}
