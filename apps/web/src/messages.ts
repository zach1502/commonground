import context from './locales/en.context.json' with { type: 'json' };
import describe from './locales/en.describe.json' with { type: 'json' };
import design from './locales/en.design.json' with { type: 'json' };
import insights from './locales/en.insights.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import participation from './locales/en.participation.json' with { type: 'json' };
import planner from './locales/en.planner.json' with { type: 'json' };
import review from './locales/en.review.json' with { type: 'json' };
import styleguide from './locales/en.styleguide.json' with { type: 'json' };

/** Every user-visible string; components read from here instead of inlining text. */
export const messages = {
  ...en,
  ...context,
  ...participation,
  ...planner,
  ...describe,
  ...insights,
  ...design,
  ...review,
  ...styleguide,
};

/** Fills {name} slots in a message with values. */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in values ? String(values[name]) : slot,
  );
}
