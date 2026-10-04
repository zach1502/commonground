import { useEffect, useRef, type MouseEvent } from 'react';

import { format, messages } from '../messages';

import type { FieldErrors, NumberFieldId } from './parameters-form';

const strings = messages.planner.parameters;

interface ErrorLink {
  readonly key: string;
  readonly targetId: string;
  readonly text: string;
}

const COUNT_KEY = /^count-(\w+)-(min|max)$/;

function labelFor(key: string): string {
  const count = COUNT_KEY.exec(key);
  if (count !== null) {
    const category = strings.counts.categories[count[1] as keyof typeof strings.counts.categories];
    const template = count[2] === 'min' ? strings.counts.minLabel : strings.counts.maxLabel;
    return format(template, { category });
  }
  if (key === 'brief') return strings.fields.brief.label;
  return strings.fields[key as NumberFieldId].label;
}

/** Each error as a link to its field, in the order the fields sit on the page. */
export function errorLinks(errors: FieldErrors): ErrorLink[] {
  return Object.entries(errors)
    .filter(([key]) => key !== 'form')
    .map(([key, message]) => ({
      key,
      targetId: COUNT_KEY.test(key) ? `input-${key}` : `field-${key}`,
      text: `${labelFor(key)}: ${message}`,
    }));
}

/** "Error: " before the page title, once, while the form has errors. */
export function errorTitle(title: string): string {
  return title.startsWith(strings.errorPrefix) ? title : `${strings.errorPrefix}${title}`;
}

function focusField(event: MouseEvent<HTMLAnchorElement>, targetId: string) {
  const field = document.getElementById(targetId);
  if (field === null) return;
  event.preventDefault();
  field.closest('details')?.setAttribute('open', '');
  field.focus();
}

/**
 * The list of problems shown when Continue finds errors. It takes focus when it appears, marks
 * the page title, and each line moves focus to its field.
 */
export function ErrorSummary({ errors }: { readonly errors: FieldErrors }) {
  const box = useRef<HTMLDivElement>(null);
  const links = errorLinks(errors);
  useEffect(() => {
    box.current?.focus();
    const before = document.title;
    document.title = errorTitle(before);
    return () => {
      document.title = before;
    };
  }, [errors]);
  return (
    <div ref={box} tabIndex={-1} className="web-error-summary">
      <div role="alert">
        <h3 className="web-error-summary__heading">{strings.formError}</h3>
        <ul className="web-error-summary__list">
          {links.map((link) => (
            <li key={link.key}>
              <a
                href={`#${link.targetId}`}
                onClick={(event) => {
                  focusField(event, link.targetId);
                }}
              >
                {link.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
