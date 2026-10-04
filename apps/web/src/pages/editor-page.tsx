import { useLoaderData } from 'react-router';

import { screenSize, SmallScreenNotice } from '@parkshape/scene/editor';

import type { WebDeps } from '../app-deps';
import { editorStrings } from '../editor/editor-strings';
import { EditorWorkspace } from '../editor/editor-workspace';
import type { EditorData } from '../editor/offline-editor';
import { useViewportWidth } from '../editor/use-viewport-width';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { PATHS } from '../routing/paths';

/** The editor route. It is desktop only: under 1024 px it explains that and links to voting. */
export function EditorPage({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'editor'> }) {
  const data = useLoaderData<EditorData>();
  const width = useViewportWidth();
  const { meta } = messages;
  useDocumentMeta({
    title: format(meta.editor.title, { name: data.project.name }),
    description: format(meta.editor.description, { name: data.project.name }),
  });
  if (screenSize(width) === 'small') {
    return (
      <div className="web-page">
        <SmallScreenNotice strings={editorStrings()} votingHref={PATHS.project(data.project.id)} />
      </div>
    );
  }
  return <EditorWorkspace key={data.design.id} {...data} deps={deps} />;
}
