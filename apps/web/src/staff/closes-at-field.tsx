import { FieldInput, FieldWithHelp } from '@parkshape/ui';

import { messages } from '../messages';

const text = messages.planner.parameters.closesAt;

export interface ClosesAtFieldProps {
  /** An ISO date such as 2026-10-31, or empty for no closing day. */
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The last day residents can design and vote; the API closes the project after it. */
export function ClosesAtField({ value, onChange }: ClosesAtFieldProps) {
  return (
    <FieldWithHelp id="field-closesAt" label={text.label} help={text.help} size="long">
      {(control) => (
        <FieldInput
          {...control}
          type="date"
          name="closesAt"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </FieldWithHelp>
  );
}
