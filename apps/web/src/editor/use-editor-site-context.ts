import { useMemo } from 'react';

import { parcelSchema } from '@parkshape/core';
import type { EditorSiteContext } from '@parkshape/scene/editor';

import type { Project } from '../api/web-api';
import { useProjectContext, type ContextApi } from '../design/use-project-context';

/**
 * The site context for the editor: the streets and stops around the parcel, the boundary the
 * entrance snap lands on, and the device storage that keeps the Layers menu choice.
 */
export function useEditorSiteContext(
  api: ContextApi,
  project: Project,
  storage: Storage,
): EditorSiteContext {
  const load = useProjectContext(api, project.id);
  const parcel = useMemo(() => parcelSchema.parse(project.parcel).polygon, [project.parcel]);
  return useMemo(() => ({ load, parcel, storage }), [load, parcel, storage]);
}
