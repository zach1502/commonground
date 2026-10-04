import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { failedConstraints, type ConstraintKey, type MetricsReport } from '@parkshape/core';
import {
  BlockingList,
  Meter,
  Pulse,
  StatusBadge,
  useDebounced,
  type BlockingItem,
} from '@parkshape/ui';

import { buildMeterGroups, type MeterModel, type MetersStrings } from './meters-model';
import { PROBLEMS_ID } from './submit-gate';

// Rapid edits change a meter many times a second; one announcement after the change settles.
const ANNOUNCE_DELAY_MS = 250;

interface Reading {
  readonly label: string;
  readonly valueText: string;
}

/** Names the gauge meters that changed since the last settle, so one region announces once. */
function useMeterAnnouncement(readings: readonly Reading[]): string {
  const signature = readings.map((reading) => `${reading.label}=${reading.valueText}`).join('|');
  const settled = useDebounced(signature, ANNOUNCE_DELAY_MS);
  const previous = useRef<Map<string, string> | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const current = new Map(readings.map((reading) => [reading.label, reading.valueText]));
    const seen = previous.current;
    previous.current = current;
    if (seen === null) return;
    const changed = readings
      .filter((reading) => seen.get(reading.label) !== reading.valueText)
      .map((reading) => `${reading.label} ${reading.valueText}`);
    if (changed.length > 0) setMessage(changed.join('. '));
  }, [settled]);
  return message;
}

/** One polite region for the whole panel, kept out of sight, read after a change settles. */
function MeterAnnouncer({ readings }: { readonly readings: readonly Reading[] }) {
  const message = useMeterAnnouncement(readings);
  return (
    <span role="status" aria-live="polite" className="ps-visually-hidden">
      {message}
    </span>
  );
}

export interface MetersPanelStrings extends MetersStrings {
  readonly heading: string;
}

export interface MetersPanelProps {
  readonly report: MetricsReport | null;
  readonly strings: MetersPanelStrings;
  readonly onShowMe: (key: ConstraintKey) => void;
  /** Whether the camera can frame the problem for a failed constraint. */
  readonly canShow: (key: ConstraintKey) => boolean;
}

/** A badge marks a real status, so a met meter shows none. */
function MeterRow({ meter }: { readonly meter: MeterModel }) {
  const shown = meter.status === 'ok' ? '' : meter.statusText;
  return (
    <Pulse pulseKey={meter.signature}>
      <div className="web-meter">
        {meter.gauge === undefined ? (
          <div className="web-meter__head">
            <span className="web-meter__label">{meter.label}</span>
            {meter.status === 'ok' ? null : (
              <StatusBadge status={meter.status} statusText={meter.statusText} />
            )}
          </div>
        ) : (
          <Meter
            label={meter.label}
            value={meter.gauge.value}
            limit={meter.gauge.limit}
            status={meter.status}
            valueText={meter.gauge.valueText}
            statusText={shown}
          />
        )}
        {meter.message === undefined ? null : (
          <p className="web-meter__message" data-kind="data">
            {meter.message}
          </p>
        )}
      </div>
    </Pulse>
  );
}

function blockingItemsOf(report: MetricsReport, props: MetersPanelProps): BlockingItem[] {
  return failedConstraints(report).map((key) => ({
    id: key,
    message: report.constraints[key].message,
    severityText: props.strings.blocksSubmission,
    canShow: props.canShow(key),
  }));
}

// The group heading sits one weight step above the meter labels, so the themes read as headings
// over their rows rather than a flat wall of same-weight text.
const groupHeadingStyle = { font: 'var(--typography-bold-body)' } as const;

/** A titled set of meters; matches the design system section so it reads as a named region. */
function MetersGroup({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="ps-meter-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="ps-meter-group__heading" style={groupHeadingStyle}>
        {heading}
      </h3>
      <div className="ps-meter-group__body">{children}</div>
    </section>
  );
}

/** The live meters beside the editor, with the blocking problems listed above them. */
export function MetersPanel(props: MetersPanelProps) {
  const { report, strings } = props;
  const headingId = useId();
  if (report === null) return null;
  const groups = buildMeterGroups(report, strings).filter((group) => group.meters.length > 0);
  const readings: Reading[] = groups
    .flatMap((group) => group.meters)
    .flatMap((meter) =>
      meter.gauge === undefined ? [] : [{ label: meter.label, valueText: meter.gauge.valueText }],
    );
  return (
    <aside className="web-meters" aria-labelledby={headingId}>
      <h2 id={headingId} className="web-meters__heading">
        {strings.heading}
      </h2>
      <MeterAnnouncer readings={readings} />
      <BlockingList
        id={PROBLEMS_ID}
        heading={strings.blockingHeading}
        items={blockingItemsOf(report, props)}
        showMeLabel={strings.showMe}
        onShowMe={(id) => {
          props.onShowMe(id as ConstraintKey);
        }}
      />
      {groups.map((group) => (
        <MetersGroup key={group.id} heading={group.heading}>
          {group.meters.map((meter) => (
            <MeterRow key={meter.key} meter={meter} />
          ))}
        </MetersGroup>
      ))}
    </aside>
  );
}
