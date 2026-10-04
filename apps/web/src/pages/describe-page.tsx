import { useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';

import { MAX_DESCRIPTION_CHARS } from '@parkshape/core';
import { Button, FieldTextArea, FieldWithHelp, InlineAlert, PageTitle, Stack } from '@parkshape/ui';

import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { DescribeData, DescribeError } from '../routing/describe';

const FIELD_ID = 'describe-text';
const FIELD_ROWS = 4;

interface ExamplesProps {
  /** The description as it is now, so the example it matches shows as pressed. */
  readonly value: string;
  readonly onPick: (example: string) => void;
}

/** Example prompts as secondary buttons; picking one fills the description field. */
function Examples({ value, onPick }: ExamplesProps) {
  const text = messages.describe;
  const examples = [text.example1, text.example2, text.example3];
  return (
    <Stack as="section" gap="small" aria-label={text.examplesLabel}>
      <p className="web-describe__examples-label">{text.examplesLabel}</p>
      <ul className="web-describe__examples">
        {examples.map((example) => (
          <li key={example}>
            <Button
              variant="secondary"
              size="small"
              aria-pressed={value === example ? 'true' : 'false'}
              onPress={() => {
                onPick(example);
              }}
            >
              {example}
            </Button>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

interface GenerateActionsProps {
  readonly state: 'pending' | 'idle';
  readonly onGenerate: () => void;
}

/** Make my layout, with a status line that names the terrain source while the layout is made. */
function GenerateActions({ state, onGenerate }: GenerateActionsProps) {
  const text = messages.describe;
  const pending = state === 'pending';
  return (
    <div className="web-describe__actions">
      <Button variant="primary" isPending={pending} onPress={onGenerate}>
        {text.generate}
      </Button>
      <p role="status" className="web-describe__status">
        {pending ? text.generating : null}
      </p>
    </div>
  );
}

/**
 * Describe it: a resident writes what the park should have, and Make my layout lays it out.
 * The field comes first; the examples below it fill the field.
 */
export function DescribePage() {
  const { project } = useLoaderData<DescribeData>();
  const actionData = useActionData<DescribeError>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [value, setValue] = useState('');
  const [emptyError, setEmptyError] = useState<'shown' | 'hidden'>('hidden');
  const text = messages.describe;
  useDocumentMeta({
    title: messages.meta.describe.title,
    description: format(messages.meta.describe.description, { name: project.name }),
  });
  const generate = () => {
    const description = value.trim();
    if (description === '') {
      setEmptyError('shown');
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    void submit({ text: description }, { method: 'post', encType: 'application/json' });
  };
  return (
    <Stack gap="large" className="web-page web-describe">
      <PageTitle lede={format(text.lede, { name: project.name })}>{text.heading}</PageTitle>
      {actionData?.error === 'describe-failed' ? (
        <InlineAlert tone="danger" title={text.failed} />
      ) : null}
      <FieldWithHelp
        id={FIELD_ID}
        label={text.field}
        help={format(text.count, { count: value.length, max: MAX_DESCRIPTION_CHARS })}
        error={emptyError === 'shown' ? text.empty : undefined}
      >
        {(control) => (
          <FieldTextArea
            {...control}
            value={value}
            rows={FIELD_ROWS}
            maxLength={MAX_DESCRIPTION_CHARS}
            onChange={(event) => {
              setValue(event.target.value);
              setEmptyError('hidden');
            }}
          />
        )}
      </FieldWithHelp>
      <GenerateActions
        state={navigation.state === 'submitting' ? 'pending' : 'idle'}
        onGenerate={generate}
      />
      <Examples
        value={value}
        onPick={(example) => {
          setValue(example);
          setEmptyError('hidden');
        }}
      />
    </Stack>
  );
}
