// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TerraformSettings } from '../../editor/store/types.js';
import type { ReadoutText } from '../../editor/terraform/readout.js';
import { TEST_STRINGS } from '../test-strings.js';

import { TerraformControls } from './TerraformControls.js';

afterEach(cleanup);

const settings: TerraformSettings = { mode: 'raise', radiusM: 5, strength: 0.5 };
const readout: ReadoutText = {
  cut: '0 m³',
  fill: '2 m³',
  net: '2 m³',
  trucks: '1 truck trip',
  disturbed: '3%',
};

function renderControls(overrides: Partial<Parameters<typeof TerraformControls>[0]> = {}) {
  const onSettings = vi.fn();
  render(
    <TerraformControls
      strings={TEST_STRINGS}
      settings={settings}
      readout={readout}
      canLevelItem="yes"
      onSettings={onSettings}
      {...overrides}
    />,
  );
  return onSettings;
}

describe('TerraformControls', () => {
  it('keys the red hatching under the sliders', () => {
    renderControls();
    const key = screen.getByText('Red hatching marks ground you cannot change.');
    const strength = screen.getByLabelText(/^Strength/);
    expect(strength.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks the active mode and changes mode on click', () => {
    const onSettings = renderControls();
    expect(screen.getByRole('button', { name: 'Raise', pressed: true })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Smooth' }));
    expect(onSettings).toHaveBeenCalledWith({ ...settings, mode: 'smooth' });
  });

  it('updates the radius from its slider', () => {
    const onSettings = renderControls();
    fireEvent.change(screen.getByLabelText(/Radius/), { target: { value: '8' } });
    expect(onSettings).toHaveBeenCalledWith({ ...settings, radiusM: 8 });
  });

  it('shows the live earthworks readout', () => {
    renderControls();
    expect(screen.getByText('Fill: 2 m³')).toBeDefined();
    expect(screen.getByText('Haul: 1 truck trip')).toBeDefined();
    expect(screen.getByText('Disturbed: 3%')).toBeDefined();
  });

  it('disables level under item and explains why with no selection', () => {
    renderControls({ settings: { ...settings, mode: 'level-item' }, canLevelItem: 'no' });
    expect(screen.getByRole('button', { name: 'Level under item' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('Select an item to level under it')).toBeDefined();
  });
});
