import type { CSSProperties, ReactNode } from 'react';

import { classNames } from './class-names.js';

// Numbers read down a column when they are right aligned in tabular figures, so digits line up.
// Inline so a Testing Library test can read the alignment without loading the stylesheet.
const NUMERIC_STYLE: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export interface NumericCellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export interface NumericHeaderCellProps extends NumericCellProps {
  readonly scope?: 'col' | 'row';
}

/** A table body cell for a number. The unit belongs in the column header, not in every cell. */
export function NumericCell({ children, className }: NumericCellProps) {
  return (
    <td className={classNames('ps-table__num', className)} style={NUMERIC_STYLE}>
      {children}
    </td>
  );
}

/** A right-aligned header cell for a numeric column, where the unit is named once. */
export function NumericHeaderCell({ children, className, scope = 'col' }: NumericHeaderCellProps) {
  return (
    <th scope={scope} className={classNames('ps-table__num', className)} style={NUMERIC_STYLE}>
      {children}
    </th>
  );
}
