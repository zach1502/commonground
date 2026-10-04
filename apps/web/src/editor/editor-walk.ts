import { useMemo } from 'react';

import { parcelSchema } from '@parkshape/core';
import type { WalkProps } from '@parkshape/scene/viewer';

import type { Design, Project } from '../api/web-api';
import { itemLabels } from '../features/review/review-model';
import { messages } from '../messages';
import { walkStrings } from '../viewer-strings';

/** The editor's park walk: the same walk as the design page, leaving it says Back to editing. */
export function useEditorWalk(design: Design, project: Project): WalkProps {
  return useMemo(() => {
    const ground = parcelSchema.parse(project.parcel).polygon.map((point) => ({
      x: point.x,
      z: point.y,
    }));
    const strings = { ...walkStrings(), exit: messages.walk.exitEditor };
    return { parcel: ground, strings, labels: itemLabels(design, project) };
  }, [design, project]);
}
