import { Radio, RadioGroup as BcRadioGroup } from '@bcgov/design-system-react-components';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface RadioGroupProps {
  readonly label: string;
  readonly options: readonly RadioOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly description?: string;
  /** Marks each option's label and help as data, such as persona names and bios. */
  readonly optionKind?: 'data';
}

/** A BC radio group; each option can carry one line of help text. */
export function RadioGroup({ options, optionKind, ...rest }: RadioGroupProps) {
  const dataMark = optionKind === 'data' ? { 'data-kind': 'data' } : {};
  return (
    <div className="ps-radio-group">
      <BcRadioGroup {...rest}>
        {options.map((option) => (
          <Radio key={option.value} value={option.value}>
            <span className="ps-radio__text" {...dataMark}>
              <span className="ps-radio__label">{option.label}</span>
              {option.description === undefined ? null : (
                <span className="ps-radio__description">{option.description}</span>
              )}
            </span>
          </Radio>
        ))}
      </BcRadioGroup>
    </div>
  );
}
