import { useEffect, useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';

import {
  Badge,
  BcServicesCardButton,
  Button,
  Inline,
  InlineAlert,
  PageTitle,
  RadioGroup,
  Stack,
} from '@parkshape/ui';

import { useRetryAfter } from '../api/use-retry-after';
import type { Persona } from '../api/web-api';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import type { ActionError } from '../routing/actions';

/** The one inline alert for a failed login: the rate-limit wait copy, or the generic failure. */
function loginAlert(actionData: ActionError | undefined): string | null {
  if (actionData?.error === 'rate-limited') return actionData.message;
  if (actionData?.error === 'login-failed') return messages.login.failed;
  return null;
}

/** Resident login: pick a persona, then press Log in as that persona. */
export function LoginPage() {
  const { personas } = useLoaderData<{ personas: Persona[] }>();
  const actionData = useActionData<ActionError>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [persona, setPersona] = useState(personas[0]?.id ?? '');
  const { login } = messages;
  const name = personas.find((option) => option.id === persona)?.displayName ?? '';
  const retry = useRetryAfter();
  useEffect(() => {
    if (actionData?.error === 'rate-limited') retry.block(actionData.retryAfterSeconds);
  }, [actionData, retry.block]);
  useDocumentMeta(messages.meta.login);
  const alert = loginAlert(actionData);
  return (
    <Stack gap="large" className="web-page">
      <PageTitle lede={login.lede}>{login.heading}</PageTitle>
      {alert === null ? null : <InlineAlert tone="danger" title={alert} />}
      <RadioGroup
        label={login.personaLabel}
        value={persona}
        onChange={setPersona}
        optionKind="data"
        options={personas.map((option) => ({
          value: option.id,
          label: option.displayName,
          description: option.about,
        }))}
      />
      <div>
        {retry.isBlocked ? (
          <Inline gap="small">
            <Button variant="primary" isDisabled>
              {name === '' ? login.bcsc : format(login.asPersona, { name })}
            </Button>
            <Badge tone="info">{login.demoTag}</Badge>
          </Inline>
        ) : (
          <BcServicesCardButton
            label={name === '' ? login.bcsc : format(login.asPersona, { name })}
            demoTag={login.demoTag}
            isPending={navigation.state === 'submitting'}
            onPress={() => {
              void submit({ persona }, { method: 'post', encType: 'application/json' });
            }}
          />
        )}
      </div>
    </Stack>
  );
}
