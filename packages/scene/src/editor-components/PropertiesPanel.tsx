import { useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { formatCad, type PlanePoint } from '@parkshape/core';

import type { Properties } from '../editor/properties.js';
import { FROM_RIGHT } from '../motion/panel-motion.js';
import { usePresence } from '../motion/use-presence.js';

import { fill, formatArea, formatMetres, type EditorStrings } from './strings.js';
import {
  buttonStyle,
  fieldStyle,
  headingStyle,
  helpStyle,
  inputStyle,
  panelStyle,
} from './styles.js';

export interface PropertiesPanelProps {
  readonly properties: Properties;
  readonly strings: EditorStrings;
  readonly onPosition: (id: string, position: PlanePoint) => void;
  readonly onRotation: (id: string, degrees: number) => void;
  readonly onAddCorner: (id: string) => void;
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  readonly onCommit: (value: number) => void;
}

/** A number field that commits on Enter or when focus leaves, so typing is one undo step. */
function NumberField({ label, value, step, onCommit }: NumberFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
  };
  return (
    <div style={fieldStyle}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step={step}
        value={draft}
        style={inputStyle}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

const POSITION_STEP_M = 0.5;
const ROTATION_STEP = 15;

function Readout({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={fieldStyle}>
      <span style={helpStyle}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

type Of<K extends Properties['kind']> = Extract<Properties, { kind: K }>;

function ItemFields({ item, props }: { item: Of<'item'>; props: PropertiesPanelProps }) {
  const text = props.strings.properties;
  const { id, x, y } = item;
  return (
    <>
      <Readout label={text.kind} value={props.strings.categories[item.category]} />
      <Readout label={text.cost} value={formatCad(item.costCad)} />
      <NumberField
        label={text.x}
        value={x}
        step={POSITION_STEP_M}
        onCommit={(next) => {
          props.onPosition(id, { x: next, y });
        }}
      />
      <NumberField
        label={text.y}
        value={y}
        step={POSITION_STEP_M}
        onCommit={(next) => {
          props.onPosition(id, { x, y: next });
        }}
      />
      <NumberField
        label={text.rotation}
        value={item.rotationDeg}
        step={ROTATION_STEP}
        onCommit={(next) => {
          props.onRotation(id, next);
        }}
      />
    </>
  );
}

function AreaFields({ area, props }: { area: Of<'area'>; props: PropertiesPanelProps }) {
  const text = props.strings.properties;
  return (
    <>
      <Readout label={text.area} value={fill(text.areaValue, { area: formatArea(area.areaM2) })} />
      <Readout label={text.plots} value={String(area.plots)} />
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          props.onAddCorner(area.id);
        }}
      >
        {text.addCorner}
      </button>
    </>
  );
}

function Body(props: PropertiesPanelProps): ReactElement | null {
  const { properties, strings } = props;
  const text = strings.properties;
  switch (properties.kind) {
    case 'none':
      return null;
    case 'many':
      return <p style={helpStyle}>{fill(text.many, { count: properties.count })}</p>;
    case 'item':
      return <ItemFields item={properties} props={props} />;
    case 'area':
      return <AreaFields area={properties} props={props} />;
    case 'path':
      return (
        <Readout
          label={text.length}
          value={fill(text.lengthValue, { length: formatMetres(properties.lengthM) })}
        />
      );
  }
}

function titleOf(properties: Properties, strings: EditorStrings): string {
  if (properties.kind === 'item' || properties.kind === 'area') {
    return strings.catalog[properties.catalogId] ?? properties.catalogId;
  }
  if (properties.kind === 'path') {
    return strings.catalog[`path-${properties.surface}`] ?? properties.surface;
  }
  return strings.properties.heading;
}

const contentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--layout-margin-small)',
} as const;

/**
 * The selection last shown, kept while the panel's content slides out after the selection clears,
 * so a second selection while shown swaps in place with no new motion.
 */
function useShownProperties(properties: Properties) {
  const kept = useRef(properties);
  if (properties.kind !== 'none') kept.current = properties;
  const presence = usePresence<HTMLDivElement>(
    properties.kind === 'none' ? 'hidden' : 'shown',
    FROM_RIGHT,
  );
  const shown = presence.mounted === 'mounted' ? kept.current : properties;
  return { shown, ref: presence.ref, leaving: presence.leaving };
}

/** Exact settings of the selection: position and rotation, or area and plot count. */
export function PropertiesPanel(props: PropertiesPanelProps): ReactElement {
  const id = useId();
  const { shown, ref, leaving } = useShownProperties(props.properties);
  return (
    <section aria-labelledby={id} style={panelStyle}>
      <div ref={ref} style={contentStyle} {...leaving}>
        <h2 id={id} style={headingStyle}>
          {titleOf(shown, props.strings)}
        </h2>
        <Body {...props} properties={shown} />
      </div>
    </section>
  );
}
