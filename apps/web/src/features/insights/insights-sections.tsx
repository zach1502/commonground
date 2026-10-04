import { useId, useState, type ReactNode } from 'react';

import { BarChart, Button, EmptyState, type Bar } from '@parkshape/ui';

import type { Insights } from '../../api/staff-api';
import { format, messages } from '../../messages';

import {
  complianceRows,
  featureBars,
  headlineItems,
  percentText,
  reasonBars,
  splitZeroBars,
} from './insight-charts';

const text = messages.insights;
const FULL_PERCENT = 100;
// A ranking stays readable at a glance, so a view shows at most this many bars; the rest fold away.
const MAX_VISIBLE_BARS = 7;

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="web-insights__section" aria-labelledby={id}>
      <h2 id={id}>{heading}</h2>
      {children}
    </section>
  );
}

/** A finding heading: the plain lead-in with the leading category set apart as data. */
function Finding({ template, value }: { readonly template: string; readonly value: string }) {
  const [before, after = ''] = template.split('{value}');
  return (
    <>
      {before}
      <span data-kind="data">{value}</span>
      {after}
    </>
  );
}

export interface AltRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * The chart's data as a real table behind a closed disclosure, so a sighted keyboard user reads
 * the same numbers the drawing shows. Closed by default, so it adds no words to the page.
 */
function ChartTable(props: {
  readonly fold: string;
  readonly caption: string;
  readonly labelColumn: string;
  readonly valueColumn: string;
  readonly rows: readonly AltRow[];
}) {
  return (
    <details className="web-insights__fold web-insights__chart-table">
      <summary>{props.fold}</summary>
      <div className="web-insights__fold-body">
        <table className="ps-table web-insights__table">
          <caption>{props.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{props.labelColumn}</th>
              <th scope="col" className="ps-table__num">
                {props.valueColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" data-kind="data">
                  {row.label}
                </th>
                <td className="ps-table__num" data-kind="data">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A bar chart that shows rows with a value, and keeps zero rows behind Show all. */
function ChartWithZeros(props: {
  readonly caption: string;
  readonly bars: readonly Bar[];
  readonly max?: number;
  readonly format: (value: number) => string;
  readonly empty: string;
}) {
  const [rows, setRows] = useState<'some' | 'all'>('some');
  const id = useId();
  const { shown, zero } = splitZeroBars(props.bars);
  if (shown.length === 0) return <EmptyState text={props.empty} />;
  const capped = shown.slice(0, MAX_VISIBLE_BARS);
  const folded = shown.length + zero.length - capped.length;
  const bars = rows === 'all' ? props.bars : capped;
  return (
    <div className="web-insights__chart" id={id}>
      <BarChart
        caption={props.caption}
        bars={bars}
        format={props.format}
        {...(props.max === undefined ? {} : { max: props.max })}
      />
      {folded === 0 ? null : (
        <div>
          <Button
            variant="secondary"
            size="small"
            aria-expanded={rows === 'all' ? 'true' : 'false'}
            aria-controls={id}
            onPress={() => {
              setRows(rows === 'all' ? 'some' : 'all');
            }}
          >
            {rows === 'all' ? text.showFewer : format(text.showAll, { count: props.bars.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The three counts as a definition list set as one sentence at heading size. */
export function HeadlineNumbers({ headline }: { readonly headline: Insights['headline'] }) {
  return (
    <dl className="web-insights__headline" aria-label={text.headlineLabel}>
      {headlineItems(headline).map((item) => (
        <div key={item.id} className="web-insights__fact">
          <dt>{item.term}</dt>
          <dd data-kind="data">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FeatureCharts({
  features,
  designs,
}: {
  readonly features: Insights['features'];
  /** Designs submitted, so each bar can say "28 of 30 designs". */
  readonly designs: number;
}) {
  const t = text.features;
  const bars = featureBars(features, designs);
  const lead = bars.find((bar) => bar.value > 0);
  const heading =
    lead === undefined ? t.heading : <Finding template={t.title} value={lead.label} />;
  return (
    <Section id="insights-features" heading={heading}>
      <ChartWithZeros
        caption={t.shareCaption}
        bars={bars}
        max={FULL_PERCENT}
        format={percentText}
        empty={t.empty}
      />
      {lead === undefined ? null : (
        <ChartTable
          fold={t.tableFold}
          caption={t.tableCaption}
          labelColumn={t.featureColumn}
          valueColumn={t.designsColumn}
          rows={bars.map((bar) => ({
            id: bar.id,
            label: bar.label,
            value: bar.valueText ?? percentText(bar.value),
          }))}
        />
      )}
    </Section>
  );
}

/** One side of the vote: its finding as a title, the bars, then the numbers as a table. */
function ReasonsChart(props: {
  readonly reasons: Insights['reasons'];
  readonly side: 'up' | 'down';
  readonly votes: number;
}) {
  const t = text.reasons[props.side];
  const bars = reasonBars(props.reasons, props.side);
  const lead = bars.find((bar) => bar.value > 0);
  return (
    <div>
      <h3>{lead === undefined ? t.heading : <Finding template={t.title} value={lead.label} />}</h3>
      <ChartWithZeros
        caption={t.caption}
        bars={splitZeroBars(bars).shown}
        format={String}
        empty={text.reasons.empty}
      />
      {lead === undefined ? null : (
        <ChartTable
          fold={t.tableFold}
          caption={format(t.tableCaption, { votes: props.votes })}
          labelColumn={text.reasons.reasonColumn}
          valueColumn={t.voteCountColumn}
          rows={bars.map((bar) => ({ id: bar.id, label: bar.label, value: String(bar.value) }))}
        />
      )}
    </div>
  );
}

/** The reasons named with up votes, then those named with down votes. */
export function ReasonsSection({
  reasons,
  votes,
}: {
  readonly reasons: Insights['reasons'];
  /** Votes cast, the denominator the tables name. */
  readonly votes: number;
}) {
  return (
    <Section id="insights-reasons" heading={text.reasons.heading}>
      <ReasonsChart reasons={reasons} side="up" votes={votes} />
      <ReasonsChart reasons={reasons} side="down" votes={votes} />
    </Section>
  );
}

export function ComplianceSection({ compliance }: { readonly compliance: Insights['compliance'] }) {
  const t = text.compliance;
  return (
    <Section id="insights-compliance" heading={t.heading}>
      <table className="ps-table web-insights__table">
        <caption>{t.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.ruleColumn}</th>
            <th scope="col" className="ps-table__num">
              {t.okColumn}
            </th>
            <th scope="col" className="ps-table__num">
              {t.warnColumn}
            </th>
            <th scope="col" className="ps-table__num">
              {t.failColumn}
            </th>
          </tr>
        </thead>
        <tbody>
          {complianceRows(compliance).map((row) => (
            <tr key={row.key}>
              <th scope="row" data-kind="data">
                {row.label}
              </th>
              <td className="ps-table__num" data-kind="data">
                {row.ok}
              </td>
              <td className="ps-table__num" data-kind="data">
                {row.warn}
              </td>
              <td className="ps-table__num" data-kind="data">
                {row.fail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
