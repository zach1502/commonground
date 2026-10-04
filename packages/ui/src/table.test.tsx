import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { NumericCell, NumericHeaderCell } from './table.js';

function renderInTable(cell: ReactNode) {
  return render(
    <table>
      <tbody>
        <tr>{cell}</tr>
      </tbody>
    </table>,
  );
}

describe('NumericCell', () => {
  it('right aligns the number in tabular figures', () => {
    renderInTable(<NumericCell>1,240</NumericCell>);
    const cell = screen.getByRole('cell', { name: '1,240' });
    expect(cell).toHaveStyle({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
    expect(cell).toHaveClass('ps-table__num');
  });
});

describe('NumericHeaderCell', () => {
  it('right aligns the header and marks it a column header', () => {
    render(
      <table>
        <thead>
          <tr>
            <NumericHeaderCell>Votes</NumericHeaderCell>
          </tr>
        </thead>
      </table>,
    );
    const header = screen.getByRole('columnheader', { name: 'Votes' });
    expect(header).toHaveStyle({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
    expect(header).toHaveAttribute('scope', 'col');
  });
});
