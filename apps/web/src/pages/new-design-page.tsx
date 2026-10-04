import { useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from 'react-router';

import { Button, ButtonLink, InlineAlert, PageTitle, Stack } from '@parkshape/ui';

import type { DesignStart, Project } from '../api/web-api';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { ActionError } from '../routing/actions';
import { PATHS } from '../routing/paths';

interface StartOption {
  readonly from: DesignStart;
  readonly label: string;
  readonly help: string;
}

interface NewDesignData {
  readonly project: Project;
  readonly describeIt: 'on' | 'off';
}

/** The closed-project branch: a notice and a link to voting, in place of the start options. */
function ClosedNewDesign({ project }: { readonly project: Project }) {
  const text = messages.newDesign;
  return (
    <Stack gap="large" className="web-page">
      <PageTitle>{format(text.heading, { name: project.name })}</PageTitle>
      <InlineAlert tone="info" title={text.closed} />
      <ButtonLink variant="primary" href={PATHS.vote(project.id)}>
        {messages.project.vote}
      </ButtonLink>
    </Stack>
  );
}

interface StartOptionListProps {
  readonly options: readonly StartOption[];
  readonly describeIt: 'on' | 'off';
  readonly pending: boolean;
  readonly onStart: (from: DesignStart) => void;
  readonly onDescribe: () => void;
}

/** The list of ways to start a design: the baseline or blank options, then optional describe-it. */
function StartOptionList({
  options,
  describeIt,
  pending,
  onStart,
  onDescribe,
}: StartOptionListProps) {
  const text = messages.newDesign;
  return (
    <ul className="web-list web-list--plain">
      {options.map((option, index) => (
        <li key={option.from} className="web-list__item">
          <Button
            variant={index === 0 ? 'primary' : 'secondary'}
            isPending={pending}
            aria-describedby={`start-${option.from}`}
            onPress={() => {
              onStart(option.from);
            }}
          >
            {option.label}
          </Button>
          <span id={`start-${option.from}`}>{option.help}</span>
        </li>
      ))}
      {describeIt === 'on' ? (
        <li className="web-list__item">
          <Button variant="secondary" aria-describedby="start-describe" onPress={onDescribe}>
            {text.describe}
          </Button>
          <span id="start-describe">{text.describeHelp}</span>
        </li>
      ) : null}
    </ul>
  );
}

/** Starts a design from the baseline, from empty ground, or from a description. */
export function NewDesignPage() {
  const { project, describeIt } = useLoaderData<NewDesignData>();
  const actionData = useActionData<ActionError>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const text = messages.newDesign;
  useDocumentMeta({
    title: messages.meta.newDesign.title,
    description: format(messages.meta.newDesign.description, { name: project.name }),
  });
  if (project.phase === 'closed') {
    return <ClosedNewDesign project={project} />;
  }
  const options: StartOption[] = [
    ...(project.baselineDesignId === null
      ? []
      : [{ from: 'baseline' as const, label: text.baseline, help: text.baselineHelp }]),
    { from: 'blank', label: text.blank, help: text.blankHelp },
  ];
  return (
    <Stack gap="large" className="web-page">
      <PageTitle>{format(text.heading, { name: project.name })}</PageTitle>
      {actionData?.error === 'start-failed' ? (
        <InlineAlert tone="danger" title={text.failed} />
      ) : null}
      <StartOptionList
        options={options}
        describeIt={describeIt}
        pending={navigation.state === 'submitting'}
        onStart={(from) => {
          void submit({ from }, { method: 'post', encType: 'application/json' });
        }}
        onDescribe={() => {
          void navigate(PATHS.describe(project.id));
        }}
      />
    </Stack>
  );
}
