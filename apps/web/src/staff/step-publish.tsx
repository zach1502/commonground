import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { defaultParameters } from '@parkshape/core';
import { Button, InlineAlert, Stack, TextField } from '@parkshape/ui';

import type { Project } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { useModelManifest } from '../design/use-model-manifest';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';

import { draftFrom } from './parameters-form';
import { projectInputFrom } from './publish';
import { publishBaselinePicture } from './publish-picture';
import { ruleRows } from './rule-rows';
import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import type { WizardState } from './wizard-state';
import { stepHref } from './wizard-steps';

const strings = messages.planner.publish;

type Publish = 'idle' | 'pending' | 'failed' | 'picture-failed';

function terrainLine(state: WizardState): string[] {
  if (state.terrain === null) return [];
  return [
    format(strings.summary.terrain, {
      provider: messages.planner.terrain.providers[state.terrain.provider],
      source: state.terrain.source.name,
    }),
  ];
}

function baselineLines(state: WizardState): string[] {
  const { baseline } = state;
  if (baseline === null) return [];
  const locked = [...baseline.items, ...baseline.areas].filter((element) => element.locked).length;
  return [
    format(strings.summary.baseline, {
      items: baseline.items.length,
      areas: baseline.areas.length,
      locked,
    }),
    format(strings.summary.zones, { count: baseline.zones.length }),
  ];
}

function summaryLines(state: WizardState): string[] {
  const { summary } = strings;
  return [
    format(summary.site, { name: state.site?.parkName ?? strings.drawnSite }),
    ...terrainLine(state),
    ...baselineLines(state),
  ];
}

/** The 5 headline rules as a definition list, each with a link back to step 4 to change it. */
function RulesReview({ state }: { readonly state: WizardState }) {
  const draft = state.draft ?? draftFrom(state.parameters ?? defaultParameters());
  return (
    <section aria-labelledby="publish-rules">
      <h3 id="publish-rules" className="web-label">
        {strings.rulesHeading}
      </h3>
      <dl className="web-wizard__rules web-wizard__rules--review">
        {ruleRows(draft).map((row) => (
          <div key={row.id} className="web-wizard__rule">
            <dt>{row.term}</dt>
            <dd>{row.value}</dd>
            <dd>
              <Link
                to={stepHref('parameters')}
                aria-label={format(strings.editRule, { rule: row.term })}
              >
                {strings.edit}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Creates the project once, then draws and stores its baseline picture the way the seed draws it,
 * so the project page shows it. The created project is kept in the wizard state, so a second
 * press, or a retry after the picture failed, reuses it: one project, and one POST.
 */
function usePublish(deps: Pick<WebDeps, 'api'>, name: string, onNameMissing: () => void) {
  const { state, update, reset } = useWizard();
  const navigate = useNavigate();
  const [publish, setPublish] = useState<Publish>('idle');
  const models = useModelManifest();
  const finish = async () => {
    reset();
    await navigate(PATHS.staff);
  };
  const onPublish = async () => {
    const input = projectInputFrom({ ...state, name });
    if (input === null) {
      onNameMissing();
      return;
    }
    setPublish('pending');
    try {
      const project = state.published ?? (await deps.api.createProject(input));
      update({ published: project });
      const picture = await publishBaselinePicture({
        api: deps.api,
        project,
        baseline: input.baselineDocument,
        manifest: models.state === 'ready' ? models.manifest : undefined,
      });
      if (picture === 'failed') setPublish('picture-failed');
      else await finish();
    } catch {
      setPublish('failed');
    }
  };
  return { publish, onPublish, finish, published: state.published };
}

/** Publish went through but the picture did not: the project is open, and two ways on. */
function PictureFailed(props: {
  readonly project: Project;
  readonly onRetry: () => void;
  readonly onFinish: () => void;
}) {
  return (
    <InlineAlert
      tone="warning"
      title={format(strings.pictureFailed, { name: props.project.name })}
      action={{ label: strings.pictureRetry, onPress: props.onRetry }}
    >
      <Button variant="tertiary" size="small" onPress={props.onFinish}>
        {strings.skipPicture}
      </Button>
    </InlineAlert>
  );
}

/** Step 6: name the project and publish it, which opens it to residents. */
export function PublishStep({ deps }: { readonly deps: Pick<WebDeps, 'api'> }) {
  const { state, update } = useWizard();
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const name = state.name === '' ? (state.site?.parkName ?? '') : state.name;
  const { publish, onPublish, finish, published } = usePublish(deps, name, () => {
    setNameError(strings.nameRequired);
  });
  return (
    <StepFrame
      step="publish"
      lede={strings.lede}
      primary={{
        label: strings.publish,
        state: publish === 'pending' ? 'pending' : 'ready',
        onPress: () => void onPublish(),
      }}
    >
      <Stack gap="large" className="web-wizard__form">
        <TextField
          label={strings.nameLabel}
          description={strings.nameHelp}
          value={name}
          errorMessage={nameError}
          onChange={(next) => {
            setNameError(undefined);
            update({ name: next });
          }}
        />
        <section aria-labelledby="publish-summary">
          <h3 id="publish-summary" className="web-label">
            {strings.summaryHeading}
          </h3>
          <ul className="web-wizard__summary">
            {summaryLines(state).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <RulesReview state={state} />
        {publish === 'failed' ? <InlineAlert tone="danger" title={strings.failed} /> : null}
        {publish === 'picture-failed' && published !== null ? (
          <PictureFailed
            project={published}
            onRetry={() => void onPublish()}
            onFinish={() => void finish()}
          />
        ) : null}
      </Stack>
    </StepFrame>
  );
}
