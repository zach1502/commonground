import { useId, useState } from 'react';
import type { ReactElement } from 'react';

import { SNAP_STEP_M } from '../editor/snap.js';

import type { ItemsListProps } from './items-list-types.js';
import { reasonText } from './reason-text.js';
import { buttonStyle, fieldStyle, helpStyle, inputStyle, subheadingStyle } from './styles.js';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function CoordinateField({ id, label, value, onChange }: FieldProps): ReactElement {
  return (
    <div style={fieldStyle}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step={SNAP_STEP_M}
        value={value}
        style={inputStyle}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

/** Adds a point item at typed coordinates, the keyboard path to placing. */
export function AddForm(props: ItemsListProps): ReactElement {
  const { strings, catalog } = props;
  const id = useId();
  const points = catalog.filter((entry) => entry.geometryKind === 'point');
  const [catalogId, setCatalogId] = useState(points[0]?.id ?? '');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const position = { x: Number.parseFloat(x), y: Number.parseFloat(y) };
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    setError(reasonText(props.onAdd(catalogId, position), strings));
  };
  return (
    <section aria-labelledby={`${id}-heading`} style={fieldStyle}>
      <h3 id={`${id}-heading`} style={subheadingStyle}>
        {strings.itemsList.addHeading}
      </h3>
      <div style={fieldStyle}>
        <label htmlFor={`${id}-item`}>{strings.itemsList.addItem}</label>
        <select
          id={`${id}-item`}
          value={catalogId}
          style={inputStyle}
          onChange={(event) => {
            setCatalogId(event.target.value);
          }}
        >
          {points.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {strings.catalog[entry.id] ?? entry.id}
            </option>
          ))}
        </select>
      </div>
      <CoordinateField id={`${id}-x`} label={strings.itemsList.addX} value={x} onChange={setX} />
      <CoordinateField id={`${id}-y`} label={strings.itemsList.addY} value={y} onChange={setY} />
      <button type="button" style={buttonStyle} onClick={add}>
        {strings.itemsList.addButton}
      </button>
      {error === null ? null : (
        <p role="alert" style={helpStyle}>
          {error}
        </p>
      )}
    </section>
  );
}
