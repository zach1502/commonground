import { MAX_LABEL_CHARS, type Summary } from '../../schema/summary.js';
import type { ElementFeedbackDigest } from '../../types.js';

import phraseBank from './phrase-bank.json' with { type: 'json' };

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (found, key: string) => values[key] ?? found);
}

/**
 * \"{n} comments on elements, most on {label}\", from counts only. The name drops when the line
 * would pass the label budget, and the line is absent while nobody has commented.
 */
export function commentLineOf(feedback: ElementFeedbackDigest): Pick<Summary, 'commentLine'> {
  if (feedback.comments === 0) return {};
  const text = phraseBank.commentLine;
  const forms = feedback.comments === 1 ? text.one : text.other;
  const count = String(feedback.comments);
  const top = feedback.topElements[0];
  const full = top === undefined ? undefined : fill(forms.full, { count, label: top.label });
  const commentLine =
    full !== undefined && full.length <= MAX_LABEL_CHARS ? full : fill(forms.bare, { count });
  return { commentLine };
}
