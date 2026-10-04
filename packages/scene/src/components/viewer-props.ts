import type { GroupProps } from '@react-three/fiber';
import type { ReactNode } from 'react';

import type { Heightmap } from '@parkshape/core';

import type { MotionPreference } from '../motion/rise.js';
import type { CompareShowing } from '../overlay/CompareToggle.js';
import type { ScenePalette } from '../palette/colours.js';
import type { SceneModel } from '../scene-model.js';
import type { AssetManifest, ParkDocument } from '../types.js';

import type { KeyTarget, ViewRequest } from './Controls.js';
import type { Frameloop } from './frameloop.js';
import type { SceneInspector } from './inspect.js';
import type { RenderProfileState } from './use-render-profile.js';

export interface ViewerCanvasProps {
  readonly heightmap: Heightmap;
  readonly terrain: Heightmap;
  readonly document: ParkDocument;
  readonly model: SceneModel;
  readonly palette: ScenePalette;
  readonly motion: MotionPreference;
  readonly showing: CompareShowing;
  readonly view: ViewRequest;
  readonly manifest?: AssetManifest | undefined;
  readonly onReady: () => void;
  readonly onFrameTime?: ((frameMs: number) => void) | undefined;
  /** Pointer handlers on the ground only, so the editor can raycast to the terrain. */
  readonly terrainEvents?: GroupProps | undefined;
  /** Extra scene content on the island, such as the editor's ghost and handles. */
  readonly children?: ReactNode;
  readonly onCameraStart?: (() => void) | undefined;
  readonly keys?: KeyTarget | undefined;
  /** 'demand' draws only after a change, which keeps editing responsive on slow GPUs. */
  readonly frameloop?: Frameloop | undefined;
  /** 'preserve' keeps the last frame readable, so a thumbnail can copy it after the draw. */
  readonly drawingBuffer?: DrawingBuffer | undefined;
  /** The probed or forced tier, from useRenderProfile in the component that holds the canvas. */
  readonly renderProfile: RenderProfileState;
  /** Test hook: receives a function that reads the live renderer settings. */
  readonly onInspect?: ((inspect: SceneInspector) => void) | undefined;
}

export type DrawingBuffer = 'preserve' | 'discard';
