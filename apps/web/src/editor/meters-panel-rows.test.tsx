import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DesignDocument } from '@parkshape/core';

import { emptyDoc, renderDoc, strings, withLockedTree, withPath } from './meters-panel.harness';

function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: '.web-meter__label' }).closest('.web-meter');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${label}`);
  return row;
}

const GATED_LABELS = ['Path slopes', 'Closed zones', 'Item counts', 'Trees at risk'] as const;
const WITH_SUBJECT: readonly [DesignDocument, string][] = [
  [withPath, 'Path slopes'],
  [withLockedTree, 'Trees at risk'],
];

describe('MetersPanel rows', () => {
  it('hides a gated row while its measure has no subject', () => {
    renderDoc(emptyDoc);
    for (const label of GATED_LABELS) {
      expect(screen.queryByText(label, { selector: '.web-meter__label' })).toBeNull();
    }
  });

  it.each(WITH_SUBJECT)('shows a gated row once its subject exists: %s', (document, label) => {
    renderDoc(document);
    expect(screen.getByText(label, { selector: '.web-meter__label' })).toBeInTheDocument();
  });

  it('shows no badge and no narration on a met row, only its label', () => {
    renderDoc(withPath);
    const slopes = rowOf('Path slopes');
    expect(slopes.querySelector('.ps-status-badge')).toBeNull();
    expect(slopes).not.toHaveTextContent('Met');
    expect(slopes.querySelector('.web-meter__message')).toBeNull();
    expect(slopes.querySelector('.web-meter__label')).toHaveTextContent('Path slopes');
  });

  it('shows a failed row as one Not met badge, with the message only in the list above', () => {
    renderDoc(emptyDoc);
    const required = rowOf('Required features');
    expect(required.querySelector('.ps-status-badge')).toHaveTextContent('Not met');
    expect(required).not.toHaveTextContent(strings.blocksSubmission);
    expect(required.querySelector('.web-meter__message')).toBeNull();
    expect(screen.getAllByText(/garden items\. Add at least 1/)).toHaveLength(1);
  });

  it('reads each gauge against its target', () => {
    renderDoc(emptyDoc);
    expect(screen.getByRole('meter', { name: 'Tree canopy at maturity' })).toHaveAttribute(
      'aria-valuetext',
      '0% of 30%',
    );
    expect(screen.getByRole('meter', { name: 'Hard surfaces' })).toHaveAttribute(
      'aria-valuetext',
      '0% of 35%',
    );
    expect(screen.getByText('$0 of $500,000')).toBeInTheDocument();
  });

  it('writes no status line under a met gauge, and the status under one off target', () => {
    renderDoc(emptyDoc);
    const surfaces = screen.getByRole('meter', { name: 'Hard surfaces' });
    expect(surfaces.querySelector('.ps-meter__status')).toHaveTextContent(/^$/);
    const canopy = screen.getByRole('meter', { name: 'Tree canopy at maturity' });
    expect(canopy.querySelector('.ps-meter__status')).toHaveTextContent('Off target');
  });
});
