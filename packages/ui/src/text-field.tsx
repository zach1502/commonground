import { TextField as BcTextField } from '@bcgov/design-system-react-components';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly description?: string;
  readonly errorMessage?: string | undefined;
  readonly name?: string;
  readonly isDisabled?: boolean;
  readonly isRequired?: boolean;
  readonly maxLength?: number;
  readonly autoComplete?: string;
  /** Password hides what the person types. */
  readonly type?: 'text' | 'password';
}

/** A BC text field: label above, help text below and the error inline under the field. */
export function TextField({ errorMessage, ...rest }: TextFieldProps) {
  return (
    <BcTextField
      {...rest}
      isInvalid={errorMessage !== undefined}
      {...(errorMessage === undefined ? {} : { errorMessage })}
    />
  );
}
