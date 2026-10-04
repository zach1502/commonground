import { apiUrl } from '@parkshape/api-client';
import { INSIGHTS_EXPORT_TOP_N } from '@parkshape/core';
import { DownloadLink } from '@parkshape/ui';

import type { ExportFormat, Insights } from '../../api/staff-api';
import { format, messages } from '../../messages';

import { engagementRows, type EngagementRow } from './insight-charts';

const text = messages.insights;
const FORMATS: readonly ExportFormat[] = ['csv', 'geojson', 'dxf'];

/** The file name the API sends in its attachment header, so both agree. */
export function exportFilename(projectId: string, exportFormat: ExportFormat): string {
  return `parkshape-${projectId}-top-${String(INSIGHTS_EXPORT_TOP_N)}.${exportFormat}`;
}

export interface ExportLinksProps {
  readonly apiBaseUrl: string;
  readonly projectId: string;
}

/** CSV is the page's one primary action; GeoJSON and DXF are secondary. */
export function ExportLinks({ apiBaseUrl, projectId }: ExportLinksProps) {
  return (
    <section className="web-insights__section" aria-labelledby="insights-exports">
      <h2 id="insights-exports">
        {format(text.exports.heading, { count: INSIGHTS_EXPORT_TOP_N })}
      </h2>
      <p>{text.exports.lede}</p>
      <div className="web-insights__exports">
        {FORMATS.map((exportFormat) => (
          <DownloadLink
            key={exportFormat}
            href={apiUrl(
              apiBaseUrl,
              `/projects/${encodeURIComponent(projectId)}/insights/export.${exportFormat}`,
            )}
            filename={exportFilename(projectId, exportFormat)}
            variant={exportFormat === 'csv' ? 'primary' : 'secondary'}
          >
            {text.exports[exportFormat]}
          </DownloadLink>
        ))}
      </div>
    </section>
  );
}

function EngagementTable({ caption, rows }: { caption: string; rows: readonly EngagementRow[] }) {
  const t = text.engagement;
  return (
    <table className="ps-table web-insights__table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t.groupColumn}</th>
          <th scope="col" className="ps-table__num">
            {t.peopleColumn}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" data-kind="data">
              {row.group}
            </th>
            <td className="ps-table__num" data-kind="data">
              {row.people}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EngagementSection({ engagement }: { readonly engagement: Insights['engagement'] }) {
  const t = text.engagement;
  return (
    <section className="web-insights__section" aria-labelledby="insights-engagement">
      <h2 id="insights-engagement">{t.heading}</h2>
      <p className="web-insights__note">{t.caption}</p>
      <div className="web-insights__pair">
        <EngagementTable caption={t.fsaCaption} rows={engagementRows(engagement.byFsa, String)} />
        <EngagementTable
          caption={t.ageCaption}
          rows={engagementRows(engagement.byAgeBand, (band) => messages.selfReport.ageBands[band])}
        />
      </div>
    </section>
  );
}
