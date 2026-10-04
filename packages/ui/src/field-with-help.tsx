import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/** The attributes FieldWithHelp hands to its control, so the label and help are wired up. */
export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string;
  readonly 'aria-invalid': 'true' | 'false';
}

export interface FieldWithHelpProps {
  readonly id: string;
  readonly label: string;
  /** One sentence that says what the setting does. */
  readonly help: string;
  /** Names the default and its source, such as "Default: 30% (Vancouver Urban Forest Strategy target)". */
  readonly defaultNote?: string | undefined;
  readonly error?: string | undefined;
  /** Text before the value, such as "$". */
  readonly prefix?: string | undefined;
  /** A unit after the value, such as "m" or "%". The label repeats it. */
  readonly suffix?: string | undefined;
  /** How wide the value can get: a short number, a money amount, or a long entry. */
  readonly size?: FieldSize;
  readonly children: (control: FieldControlProps) => ReactNode;
}

export type FieldSize = 'short' | 'money' | 'long';

function Affix({ text }: { readonly text: string | undefined }) {
  if (text === undefined) return null;
  return (
    <span className="ps-field__affix" aria-hidden="true">
      {text}
    </span>
  );
}

function describedByOf(
  ids: { error: string; help: string; note: string },
  props: FieldWithHelpProps,
) {
  return [
    ...(props.error === undefined ? [] : [ids.error]),
    ids.help,
    ...(props.defaultNote === undefined ? [] : [ids.note]),
  ].join(' ');
}

/**
 * A form field: the label above, the control with any prefix or unit, the error inline under it,
 * then one hint line that holds the help sentence and the default.
 */
export function FieldWithHelp(props: FieldWithHelpProps) {
  const { id, label, help, defaultNote, error, prefix, suffix, size = 'short', children } = props;
  const ids = { error: `${id}-error`, help: `${id}-help`, note: `${id}-default` };
  return (
    <div className="ps-field">
      <label htmlFor={id} className="ps-field__label">
        {label}
      </label>
      <span className={`ps-field__row ps-field__row--${size}`}>
        <Affix text={prefix} />
        {children({
          id,
          'aria-describedby': describedByOf(ids, props),
          'aria-invalid': error === undefined ? 'false' : 'true',
        })}
        <Affix text={suffix} />
      </span>
      {error === undefined ? null : (
        <p id={ids.error} className="ps-field__error">
          {error}
        </p>
      )}
      <p className="ps-field__hint">
        <span id={ids.help} className="ps-field__help">
          {help}
        </span>
        {defaultNote === undefined ? null : (
          <>
            {' '}
            <span id={ids.note} className="ps-field__default">
              {defaultNote}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/** A plain input styled to sit inside FieldWithHelp. */
export function FieldInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="ps-field__control" />;
}

export function FieldSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="ps-field__control" />;
}

export function FieldTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="ps-field__control ps-field__control--text" />;
}
