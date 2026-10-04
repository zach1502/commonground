import type { ReactNode } from 'react';

import { EmptyState, Histogram } from '@parkshape/ui';

import type { Insights } from '../../api/staff-api';
import { format, messages } from '../../messages';
import { pluralise } from '../../plural';

import { baselineRows, designReasonRows, earthworksBins } from './insight-charts';

const text = messages.insights;
const BASELINE_COLUMNS = 4;

/** A closed disclosure that names what it holds and how many rows; folds never nest. */
function Fold({ summary, children }: { readonly summary: string; readonly children: ReactNode }) {
  return (
    <details className="web-insights__fold">
      <summary>{summary}</summary>
      <div className="web-insights__fold-body">{children}</div>
    </details>
  );
}

export function ReasonsByDesignFold({ reasons }: { readonly reasons: Insights['reasons'] }) {
  const t = text.reasons;
  const rows = designReasonRows(reasons);
  return (
    <Fold summary={pluralise(rows.length, t.byDesignFold)}>
      <table className="ps-table web-insights__table">
        <caption>{t.byDesignCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.designColumn}</th>
            <th scope="col" className="ps-table__num">
              {t.votesColumn}
            </th>
            <th scope="col">{t.reasonsColumn}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" data-kind="data">
                {row.title}
              </th>
              <td className="ps-table__num" data-kind="data">
                {row.votes}
              </td>
              <td data-kind="data">{row.named}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Fold>
  );
}

function BaselineTable({ diff }: { readonly diff: Insights['baselineDiff'] }) {
  const t = text.baseline;
  return (
    <table className="ps-table web-insights__table">
      <caption>{t.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t.featureColumn}</th>
          <th scope="col" className="ps-table__num">
            {t.movedColumn}
          </th>
          <th scope="col" className="ps-table__num">
            {t.removedColumn}
          </th>
          <th scope="col" className="ps-table__num">
            {t.resizedColumn}
          </th>
        </tr>
      </thead>
      <tbody>
        {baselineRows(diff).map((row) =>
          row.kind === 'unchanged' ? (
            <tr key={row.id}>
              <td colSpan={BASELINE_COLUMNS} data-kind="data">
                {row.label}
              </td>
            </tr>
          ) : (
            <tr key={row.id}>
              <th scope="row" data-kind="data">
                {row.label}
              </th>
              <td className="ps-table__num" data-kind="data">
                {row.moved}
              </td>
              <td className="ps-table__num" data-kind="data">
                {row.removed}
              </td>
              <td className="ps-table__num" data-kind="data">
                {row.resized}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export function BaselineFold({ diff }: { readonly diff: Insights['baselineDiff'] }) {
  const t = text.baseline;
  return (
    <Fold summary={pluralise(baselineRows(diff).length, t.fold)}>
      {diff.length === 0 ? <EmptyState text={t.empty} /> : <BaselineTable diff={diff} />}
    </Fold>
  );
}

export function EarthworksFold({ earthworks }: { readonly earthworks: Insights['earthworks'] }) {
  const t = text.earthworks;
  return (
    <Fold summary={pluralise(earthworks.bins.length, t.fold)}>
      {earthworks.bins.length === 0 ? (
        <EmptyState text={t.empty} />
      ) : (
        <Histogram
          caption={format(t.caption, { step: earthworks.binM3 })}
          axisLabel={t.axis}
          bins={earthworksBins(earthworks)}
          format={(count) => format(t.count, { count })}
        />
      )}
    </Fold>
  );
}
