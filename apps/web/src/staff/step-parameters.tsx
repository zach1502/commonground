import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { defaultParameters } from '@parkshape/core';
import { Stack } from '@parkshape/ui';

import { messages } from '../messages';

import { ClosesAtField } from './closes-at-field';
import { ErrorSummary } from './error-summary';
import {
  BriefField,
  CountsField,
  FIRST_FIELDS,
  NumberField,
  SECTIONS,
  SeverityField,
  type FieldsProps,
} from './parameters-fields';
import { draftFrom, parseDraft, type FieldErrors, type ParametersDraft } from './parameters-form';
import { ruleRows } from './rule-rows';
import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import { stepHref } from './wizard-steps';

const strings = messages.planner.parameters;

export interface ParametersFormProps extends FieldsProps {
  readonly formError: 'shown' | 'hidden';
  readonly closesAt: string;
  readonly onClosesAtChange: (value: string) => void;
}

const hasAny = (errors: FieldErrors, ids: readonly string[]) =>
  ids.some((id) => errors[id] !== undefined);

/** Everything past the first five settings, grouped as before, behind one disclosure. */
function MoreRules(fields: FieldsProps) {
  const later = SECTIONS.map(
    ([section, ids]) => [section, ids.filter((id) => !FIRST_FIELDS.includes(id))] as const,
  ).filter(([, ids]) => ids.length > 0);
  const open = Object.keys(fields.errors).some((key) => !FIRST_FIELDS.includes(key as never));
  return (
    <details className="web-wizard__more" {...(open ? { open: true } : {})}>
      <summary className="web-wizard__more-summary">{strings.more}</summary>
      <Stack gap="large">
        {later.map(([section, ids]) => (
          <fieldset key={section} className="web-wizard__fieldset">
            <legend className="web-wizard__legend">{strings.sections[section]}</legend>
            <Stack gap="medium">
              {ids.map((id) => (
                <NumberField key={id} id={id} {...fields} />
              ))}
            </Stack>
          </fieldset>
        ))}
        <CountsField {...fields} />
        <fieldset className="web-wizard__fieldset">
          <legend className="web-wizard__legend">{strings.sections.voting}</legend>
          <Stack gap="medium">
            <BriefField {...fields} />
            <NumberField id="priorUp" {...fields} />
            <NumberField id="priorDown" {...fields} />
          </Stack>
        </fieldset>
        <SeverityField {...fields} />
      </Stack>
    </details>
  );
}

/**
 * Every setting in ProjectParameters: the five a planner checks first, then one disclosure for
 * the rest. Help and a cited default sit under each field.
 */
export function ParametersForm(props: ParametersFormProps) {
  const { formError, closesAt, onClosesAtChange, ...fields } = props;
  return (
    <Stack gap="large" className="web-wizard__form">
      {formError === 'shown' ? <ErrorSummary errors={fields.errors} /> : null}
      <Stack gap="large">
        {FIRST_FIELDS.map((id) => (
          <NumberField key={id} id={id} {...fields} />
        ))}
        <ClosesAtField value={closesAt} onChange={onClosesAtChange} />
      </Stack>
      <MoreRules {...fields} />
      {hasAny(fields.errors, ['form']) ? (
        <p className="ps-field__error">{fields.errors.form}</p>
      ) : null}
    </Stack>
  );
}

/** The rules chosen so far, beside the form, so the planner sees them without scrolling. */
function RulesSummary({ draft }: { readonly draft: ParametersDraft }) {
  return (
    <aside className="web-wizard__aside" aria-labelledby="rules-summary">
      <h3 id="rules-summary" className="web-wizard__aside-heading">
        {strings.summaryHeading}
      </h3>
      <dl className="web-wizard__rules">
        {ruleRows(draft).map((row) => (
          <div key={row.id} className="web-wizard__rule">
            <dt>{row.term}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

/** Step 4: the rules designs are checked against, starting from the core defaults. */
export function ParametersStep() {
  const { state, update } = useWizard();
  const navigate = useNavigate();
  const base = useMemo(() => state.parameters ?? defaultParameters(), [state.parameters]);
  const draft = state.draft ?? draftFrom(base);
  const [errors, setErrors] = useState<FieldErrors>({});
  const onChange = (next: ParametersDraft) => {
    update({ draft: next, parameters: null });
  };
  const onContinue = () => {
    const result = parseDraft(draft, base, strings.messages);
    if (result.kind === 'invalid') {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    update({ draft, parameters: result.parameters });
    void navigate(stepHref('refine'));
  };
  return (
    <StepFrame
      step="parameters"
      lede={strings.lede}
      primary={{ label: messages.planner.wizard.continue, onPress: onContinue }}
    >
      <div className="web-wizard__split web-wizard__split--rules">
        <ParametersForm
          draft={draft}
          errors={errors}
          onChange={onChange}
          formError={Object.keys(errors).length > 0 ? 'shown' : 'hidden'}
          closesAt={state.closesAt}
          onClosesAtChange={(closesAt) => {
            update({ closesAt });
          }}
        />
        <RulesSummary draft={draft} />
      </div>
    </StepFrame>
  );
}
