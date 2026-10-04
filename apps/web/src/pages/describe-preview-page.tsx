import { lazy, Suspense } from 'react';
import { useFetcher, useLoaderData } from 'react-router';

import { Button, ButtonLink, InlineAlert, PageTitle, Stack } from '@parkshape/ui';

import type { WebDeps } from '../app-deps';
import { usePreviewTestHook } from '../design/preview-hook';
import { sceneTierFor } from '../design/scene-tier';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { DescribeError, PreviewData } from '../routing/describe';
import { PATHS } from '../routing/paths';

const ViewerPanel = lazy(async () => ({
  default: (await import('../design/viewer-panel')).ViewerPanel,
}));

const NOTES_ID = 'layout-notes';

type Generated = NonNullable<PreviewData['design']['document']['generated']>;

/** Who read the description, or nothing for a draft made before the API kept that. */
function readByLine({ source, model }: Generated): string | null {
  const text = messages.describePreview;
  if (source === 'rule-based') return text.readByRules;
  if (source === undefined) return null;
  return model === undefined ? text.readByUnnamedModel : format(text.readByModel, { model });
}

function LayoutNotes({ notes }: { readonly notes: readonly string[] }) {
  const text = messages.describePreview;
  return (
    <section aria-labelledby={NOTES_ID} className="web-describe__notes">
      <h2 id={NOTES_ID}>{text.notesHeading}</h2>
      {notes.length === 0 ? (
        <p>{text.noNotes}</p>
      ) : (
        <ul>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The generated starting point in the viewer, with its notes and the way into the editor. */
export function DescribePreviewPage({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'editor'> }) {
  const { project, design, text } = useLoaderData<PreviewData>();
  const fetcher = useFetcher<DescribeError>();
  const strings = messages.describePreview;
  const { generated } = design.document;
  const readBy = generated === undefined ? null : readByLine(generated);
  usePreviewTestHook(deps.editor.testHook, design.document);
  useDocumentMeta({
    title: messages.meta.describePreview.title,
    description: format(messages.meta.describePreview.description, { name: project.name }),
  });
  const tryAnother = () => {
    const seed = (generated?.seed ?? 0) + 1;
    void fetcher.submit(
      { text, seed },
      { method: 'post', encType: 'application/json', action: PATHS.describe(project.id) },
    );
  };
  return (
    <div className="web-design">
      <div className="web-design__stage">
        <Suspense fallback={<p className="web-empty">{strings.loading}</p>}>
          <ViewerPanel
            design={design}
            project={project}
            api={deps.api}
            tier={sceneTierFor(deps.editor.testHook)}
          />
        </Suspense>
      </div>
      <Stack gap="medium" className="web-design__details">
        <PageTitle lede={format(strings.lede, { name: project.name })}>{strings.label}</PageTitle>
        {readBy === null ? null : <p>{readBy}</p>}
        {fetcher.data?.error === 'describe-failed' ? (
          <InlineAlert tone="danger" title={strings.failed} />
        ) : null}
        <LayoutNotes notes={generated?.notes ?? []} />
        <div className="web-describe__actions">
          <ButtonLink href={PATHS.design(project.id, design.id)} variant="primary">
            {strings.openEditor}
          </ButtonLink>
          {text === '' ? null : (
            <Button variant="secondary" isPending={fetcher.state !== 'idle'} onPress={tryAnother}>
              {strings.tryAnother}
            </Button>
          )}
        </div>
      </Stack>
    </div>
  );
}
