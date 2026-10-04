import { describe, expect, it } from 'vitest';

import { catalogItems, COMPASS_ZONES } from '@parkshape/core';
import { SHORTCUTS } from '@parkshape/scene/editor';

import { editorStrings } from './editor-strings';

describe('editorStrings', () => {
  const strings = editorStrings();

  it('names every catalog entry', () => {
    catalogItems.forEach((entry) => {
      expect(strings.catalog[entry.id], entry.id).toBeTruthy();
    });
  });

  it('has a key and an action for every row of the shortcuts sheet', () => {
    SHORTCUTS.forEach(({ action }) => {
      expect(strings.shortcuts.rows[action].keys, action).toBeTruthy();
      expect(strings.shortcuts.rows[action].action, action).toBeTruthy();
    });
  });

  it('has a one-line camera and path hint and a dismiss label', () => {
    expect(strings.hints.camera).toBeTruthy();
    expect(strings.hints.path).toBeTruthy();
    expect(strings.hints.dismiss).toBeTruthy();
  });

  it('starts each Items list action name with the toolbar text the button shows', () => {
    (['rotate', 'duplicate', 'delete'] as const).forEach((action) => {
      const name = strings.itemsList[action].replace('{name}', 'Bench');
      expect(name.startsWith(strings.toolbar[action]), action).toBe(true);
      expect(name, action).toContain('Bench');
    });
  });

  it('names every compass zone for the Items list, with a count template', () => {
    const { itemsList } = strings as unknown as {
      itemsList: { place: string; placeOfMany: string; zones: Record<string, string> };
    };
    expect(itemsList.place).toContain('{zone}');
    expect(itemsList.placeOfMany).toMatch(/\{index\}\sof\s\{count\}/);
    COMPASS_ZONES.forEach((zone) => {
      expect(itemsList.zones[zone], zone).toBeTruthy();
    });
  });
});
