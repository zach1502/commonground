import { useId, useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';

import { Badge, Button, InlineAlert, Inline, PageTitle, Stack, TextField } from '@parkshape/ui';

import type { Persona } from '../api/web-api';
import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { ActionError, LoginBody } from '../routing/actions';

interface StaffLoginData {
  readonly personas: Persona[];
  readonly staffCodeRequired: boolean;
}

interface AccessCodeFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly refused: 'refused' | 'not-refused';
}

/** The password field a hosted deploy asks staff for, with the error inline under it. */
function AccessCodeField({ value, onChange, refused }: AccessCodeFieldProps) {
  const { staffLogin } = messages;
  return (
    <Stack gap="large" className="web-form">
      <TextField
        type="password"
        label={staffLogin.codeLabel}
        description={staffLogin.codeHelp}
        value={value}
        onChange={onChange}
        autoComplete="current-password"
        errorMessage={refused === 'refused' ? staffLogin.codeError : undefined}
      />
    </Stack>
  );
}

function loginBody(persona: Persona | undefined, accessCode: string | undefined): LoginBody {
  const id = persona?.id ?? '';
  return accessCode === undefined ? { persona: id } : { persona: id, accessCode };
}

/** Staff login: the demo has one planner, so there is nothing to pick. */
export function StaffLoginPage() {
  const { personas, staffCodeRequired } = useLoaderData<StaffLoginData>();
  const actionData = useActionData<ActionError>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [accessCode, setAccessCode] = useState('');
  const planner = personas[0];
  const { staffLogin } = messages;
  const tagId = useId();
  useDocumentMeta(messages.meta.staffLogin);
  const body = loginBody(planner, staffCodeRequired ? accessCode : undefined);
  return (
    <Stack gap="large" className="web-page">
      <PageTitle lede={staffLogin.lede}>{staffLogin.heading}</PageTitle>
      {actionData?.error === 'login-failed' ? (
        <InlineAlert tone="danger" title={messages.login.failed} />
      ) : null}
      {planner === undefined ? null : (
        <Stack gap="xsmall">
          <span className="web-field-label">{staffLogin.personaLabel}</span>
          <span className="web-strong">{planner.displayName}</span>
          <span>{planner.about}</span>
        </Stack>
      )}
      {staffCodeRequired ? (
        <AccessCodeField
          value={accessCode}
          onChange={setAccessCode}
          refused={actionData?.error === 'access-code-refused' ? 'refused' : 'not-refused'}
        />
      ) : null}
      <Inline gap="small">
        <Button
          aria-describedby={tagId}
          isDisabled={planner === undefined}
          isPending={navigation.state === 'submitting'}
          onPress={() => {
            void submit({ ...body }, { method: 'post', encType: 'application/json' });
          }}
        >
          {staffLogin.button}
        </Button>
        <Badge tone="info" id={tagId}>
          {messages.login.demoTag}
        </Badge>
      </Inline>
    </Stack>
  );
}
