import type { ProjectSummary } from '../../api/staff-api';
import { format, messages } from '../../messages';
import { pluralise } from '../../plural';

import { midSentence, themeRows, type ThemeRow } from './summary-rows';

const text = messages.insights.summary;
const HEADING_ID = 'insights-summary';

function countText(row: ThemeRow, total: number): string {
  return row.every === 'every' ? text.themeEvery : pluralise(row.count, text.themeCount, { total });
}

/** Who wrote this summary. The API reports it per answer, so a fallback reads as the rules. */
function sourceNote({ source, model }: ProjectSummary): string {
  if (source === 'rule-based') return text.ruleBased;
  return model === undefined ? text.unnamedModel : format(text.model, { model });
}

/**
 * The generated summary, kept apart from hand-written copy: a labelled block with the heading
 * "Generated summary", its themes and tradeoffs as definition lists inside a quote, the comment
 * line when residents have commented on elements, and a note
 * that says whether fixed rules or a model wrote it.
 */
export function SummarySection({ summary }: { readonly summary: ProjectSummary | null }) {
  if (summary === null) return null;
  const total = summary.designsRead;
  return (
    <section className="web-insights__section web-insights__summary" aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID}>{text.heading}</h2>
      <blockquote className="web-insights__quote">
        <h3>{text.themesLabel}</h3>
        <dl className="web-insights__summary-list">
          {themeRows(summary.themes, total).map((row) => (
            <div key={row.key}>
              <dt data-kind="data">{row.label}</dt>
              <dd data-kind="data">{countText(row, total)}</dd>
            </div>
          ))}
        </dl>
        <h3>{text.tradeoffsLabel}</h3>
        <dl className="web-insights__summary-list">
          {summary.tradeoffs.map(({ a, b, leanA, chose }) => (
            <div key={`${a}-${b}`}>
              <dt data-kind="data">{format(text.tradeoffPair, { a, b: midSentence(b) })}</dt>
              <dd data-kind="data">
                {format(text.tradeoffSplit, { count: leanA, total: chose, a: midSentence(a) })}
              </dd>
            </div>
          ))}
        </dl>
        {summary.commentLine === undefined ? null : (
          <p className="web-insights__comment-line" data-kind="data">
            {summary.commentLine}
          </p>
        )}
      </blockquote>
      <p className="web-insights__note">{sourceNote(summary)}</p>
    </section>
  );
}
