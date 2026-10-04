import { CONSTRAINT_KEYS, type ConstraintKey } from '@parkshape/core';
import {
  FieldInput,
  FieldSelect,
  FieldTextArea,
  FieldWithHelp,
  type FieldWithHelpProps,
} from '@parkshape/ui';

import { format, messages } from '../messages';

import {
  CATEGORIES,
  MONEY_FIELDS,
  moneyText,
  type Category,
  type CountDraft,
  type FieldErrors,
  type NumberFieldId,
  type ParametersDraft,
  type Severity,
} from './parameters-form';

const strings = messages.planner.parameters;

export const SECTIONS: readonly (readonly [
  keyof typeof strings.sections,
  readonly NumberFieldId[],
])[] = [
  ['budget', ['budgetTotal', 'cutPerM3', 'fillPerM3', 'haulPerM3']],
  ['cover', ['canopyMin', 'imperviousMax']],
  ['features', ['gardenMinPlots']],
  ['slopes', ['maxRunningSlope', 'maxCrossSlope']],
  ['terraform', ['maxDeviationM', 'maxNetHaulM3', 'maxDisturbedPercent']],
  ['trees', ['rootZonePerDbhCm']],
];

type Unit = Pick<FieldWithHelpProps, 'prefix' | 'suffix' | 'size'>;

// Each short number carries the unit its label names, so the box can be sized to the value.
const UNITS: Readonly<Partial<Record<NumberFieldId, Unit>>> = {
  budgetTotal: { prefix: '$', size: 'money' },
  cutPerM3: { prefix: '$' },
  fillPerM3: { prefix: '$' },
  haulPerM3: { prefix: '$' },
  canopyMin: { suffix: '%' },
  imperviousMax: { suffix: '%' },
  maxRunningSlope: { suffix: '%' },
  maxCrossSlope: { suffix: '%' },
  maxDeviationM: { suffix: 'm' },
  maxNetHaulM3: { suffix: 'm³' },
  maxDisturbedPercent: { suffix: '%' },
};

/** The five settings a planner checks first; the rest sit behind one disclosure. */
export const FIRST_FIELDS: readonly NumberFieldId[] = [
  'budgetTotal',
  'canopyMin',
  'imperviousMax',
  'gardenMinPlots',
  'maxRunningSlope',
];

export interface FieldsProps {
  readonly draft: ParametersDraft;
  readonly errors: FieldErrors;
  readonly onChange: (draft: ParametersDraft) => void;
}

export function NumberField({
  id,
  draft,
  errors,
  onChange,
}: FieldsProps & { readonly id: NumberFieldId }) {
  const text = strings.fields[id];
  return (
    <FieldWithHelp
      id={`field-${id}`}
      label={text.label}
      help={text.help}
      defaultNote={text.default}
      error={errors[id]}
      {...UNITS[id]}
    >
      {(control) => (
        <FieldInput
          {...control}
          name={id}
          type="text"
          inputMode="decimal"
          value={draft.numbers[id]}
          onChange={(event) => {
            onChange({ ...draft, numbers: { ...draft.numbers, [id]: event.target.value } });
          }}
          onBlur={() => {
            if (!MONEY_FIELDS.includes(id)) return;
            onChange({
              ...draft,
              numbers: { ...draft.numbers, [id]: moneyText(draft.numbers[id]) },
            });
          }}
        />
      )}
    </FieldWithHelp>
  );
}

export function BriefField({ draft, errors, onChange }: FieldsProps) {
  const text = strings.fields.brief;
  return (
    <FieldWithHelp
      id="field-brief"
      label={text.label}
      help={text.help}
      defaultNote={text.default}
      error={errors.brief}
    >
      {(control) => (
        <FieldTextArea
          {...control}
          name="brief"
          value={draft.brief}
          onChange={(event) => {
            onChange({ ...draft, brief: event.target.value });
          }}
        />
      )}
    </FieldWithHelp>
  );
}

function CountInput(
  props: FieldsProps & { readonly category: Category; readonly end: keyof CountDraft },
) {
  const { draft, errors, onChange, category, end } = props;
  const errorKey = `count-${category}-${end}`;
  const error = errors[errorKey];
  const labels = strings.counts;
  const name = labels.categories[category];
  return (
    <>
      <FieldInput
        id={`input-${errorKey}`}
        aria-label={format(end === 'min' ? labels.minLabel : labels.maxLabel, { category: name })}
        aria-invalid={error === undefined ? 'false' : 'true'}
        {...(error === undefined ? {} : { 'aria-describedby': errorKey })}
        type="text"
        inputMode="numeric"
        value={draft.counts[category][end]}
        onChange={(event) => {
          const counts = {
            ...draft.counts,
            [category]: { ...draft.counts[category], [end]: event.target.value },
          };
          onChange({ ...draft, counts });
        }}
      />
      {error === undefined ? null : (
        <span id={errorKey} className="ps-field__error">
          {error}
        </span>
      )}
    </>
  );
}

export function CountsField(props: FieldsProps) {
  const labels = strings.counts;
  return (
    <fieldset className="web-wizard__fieldset" aria-describedby="counts-help counts-default">
      <legend className="ps-field__label">{strings.sections.counts}</legend>
      <p id="counts-help" className="ps-field__help">
        {labels.help}
      </p>
      <p id="counts-default" className="ps-field__default">
        {labels.default}
      </p>
      <table className="web-table web-table--compact">
        <thead>
          <tr>
            <th scope="col">{labels.category}</th>
            <th scope="col">{labels.min}</th>
            <th scope="col">{labels.max}</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((category) => (
            <tr key={category}>
              <th scope="row">{labels.categories[category]}</th>
              <td>
                <CountInput {...props} category={category} end="min" />
              </td>
              <td>
                <CountInput {...props} category={category} end="max" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}

function SeveritySelect({
  draft,
  onChange,
  constraint,
}: FieldsProps & { readonly constraint: ConstraintKey }) {
  const text = strings.severity;
  return (
    <div className="web-wizard__severity-row">
      <label htmlFor={`severity-${constraint}`} className="ps-field__label">
        {text.keys[constraint]}
      </label>
      <FieldSelect
        id={`severity-${constraint}`}
        value={draft.severity[constraint]}
        onChange={(event) => {
          const value: Severity = event.target.value === 'hard' ? 'hard' : 'soft';
          onChange({ ...draft, severity: { ...draft.severity, [constraint]: value } });
        }}
      >
        <option value="soft">{text.options.soft}</option>
        <option value="hard">{text.options.hard}</option>
      </FieldSelect>
    </div>
  );
}

export function SeverityField(props: FieldsProps) {
  const text = strings.severity;
  return (
    <fieldset className="web-wizard__fieldset" aria-describedby="severity-default">
      <legend className="ps-field__label">{strings.sections.severity}</legend>
      <p id="severity-default" className="ps-field__default">
        {text.default}
      </p>
      <div className="web-wizard__severity">
        {CONSTRAINT_KEYS.map((constraint) => (
          <SeveritySelect key={constraint} {...props} constraint={constraint} />
        ))}
      </div>
    </fieldset>
  );
}
