import { Select as BcSelect } from '@bcgov/design-system-react-components';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

export interface SelectProps {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly value: string | null;
  readonly onChange: (key: string) => void;
  readonly placeholder?: string;
  readonly description?: string;
  readonly errorMessage?: string | undefined;
  readonly name?: string;
  readonly isDisabled?: boolean;
}

/** A BC select with one choice. */
export function Select({ options, onChange, errorMessage, ...rest }: SelectProps) {
  return (
    <BcSelect
      {...rest}
      items={options.map(({ id, label }) => ({ id, label }))}
      onChange={(key) => {
        if (key !== null) {
          onChange(String(key));
        }
      }}
      isInvalid={errorMessage !== undefined}
      {...(errorMessage === undefined ? {} : { errorMessage })}
    />
  );
}
