import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { ReactElement } from 'react';

import { N8AO_SETTINGS } from './post-effects.js';

/**
 * The desktop tier's one composer. multisampling 0, because SMAA does the edges and the canvas
 * turns MSAA off whenever this composer is on.
 */
export function PostEffects(): ReactElement {
  return (
    <EffectComposer multisampling={0}>
      <N8AO {...N8AO_SETTINGS} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
