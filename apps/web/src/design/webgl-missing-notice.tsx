import { Link } from 'react-router';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';

export interface WebGlMissingNoticeProps {
  /** Links to this project's design pictures; a project not yet published has none. */
  readonly projectId?: string;
}

/** Shown where the 3D view would be when the browser has no WebGL2. */
export function WebGlMissingNotice({ projectId }: WebGlMissingNoticeProps) {
  const text = messages.editor.viewer;
  return (
    <>
      <p>{text.webGlMissing}</p>
      {projectId === undefined ? null : (
        <p>
          <Link to={PATHS.gallery(projectId)}>{text.webGlGalleryLink}</Link>
        </p>
      )}
    </>
  );
}
