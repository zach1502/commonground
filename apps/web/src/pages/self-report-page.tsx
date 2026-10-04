import { useState } from 'react';
import { useActionData, useSubmit } from 'react-router';

import { AGE_BANDS } from '@parkshape/core';
import { Button, Inline, InlineAlert, PageTitle, Select, Stack, TextField } from '@parkshape/ui';

import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { ActionError, SelfReportBody } from '../routing/actions';

const AGE_OPTIONS = AGE_BANDS.map((id) => ({ id, label: messages.selfReport.ageBands[id] }));

/** Two optional questions shown once after a resident's first login. */
export function SelfReportPage() {
  const actionData = useActionData<ActionError>();
  const submit = useSubmit();
  const [fsa, setFsa] = useState('');
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const { selfReport } = messages;
  useDocumentMeta(messages.meta.selfReport);
  const send = (body: SelfReportBody) => {
    void submit(body, { method: 'post', encType: 'application/json' });
  };
  return (
    <Stack gap="large" className="web-page">
      <PageTitle lede={selfReport.lede}>{selfReport.heading}</PageTitle>
      {actionData?.error === 'save-failed' ? (
        <InlineAlert tone="danger" title={selfReport.saveError} />
      ) : null}
      <Stack gap="large" className="web-form">
        <TextField
          label={selfReport.fsaLabel}
          description={selfReport.fsaHelp}
          value={fsa}
          onChange={setFsa}
          maxLength={3}
          autoComplete="postal-code"
          errorMessage={actionData?.error === 'invalid-fsa' ? selfReport.fsaError : undefined}
        />
        <div data-kind="data">
          <Select
            label={selfReport.ageLabel}
            options={AGE_OPTIONS}
            value={ageBand}
            onChange={setAgeBand}
          />
        </div>
      </Stack>
      <Inline gap="medium">
        <Button
          onPress={() => {
            send({ intent: 'save', fsa, ageBand });
          }}
        >
          {selfReport.save}
        </Button>
        <Button
          variant="tertiary"
          onPress={() => {
            send({ intent: 'skip' });
          }}
        >
          {selfReport.skip}
        </Button>
      </Inline>
    </Stack>
  );
}
