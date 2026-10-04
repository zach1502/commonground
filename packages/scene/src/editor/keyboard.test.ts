import { describe, expect, it } from 'vitest';

import { actionForKey, SHORTCUTS } from './keyboard.js';

const key = (
  value: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {},
) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('actionForKey', () => {
  it('maps the DESIGN.md shortcuts', () => {
    expect(actionForKey(key('Delete'))).toBe('delete');
    expect(actionForKey(key('z', { ctrlKey: true }))).toBe('undo');
    expect(actionForKey(key('y', { ctrlKey: true }))).toBe('redo');
    expect(actionForKey(key('d', { ctrlKey: true }))).toBe('duplicate');
    expect(actionForKey(key('?', { shiftKey: true }))).toBe('shortcuts');
  });

  it('accepts Cmd on a Mac and Ctrl+Shift+Z for redo', () => {
    expect(actionForKey(key('z', { metaKey: true }))).toBe('undo');
    expect(actionForKey(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('rotates with R and back with Shift+R', () => {
    expect(actionForKey(key('r'))).toBe('rotateIncrease');
    expect(actionForKey(key('R', { shiftKey: true }))).toBe('rotateDecrease');
  });

  it('maps the tool keys, Esc, Enter and Backspace', () => {
    expect(actionForKey(key('v'))).toBe('toolSelect');
    expect(actionForKey(key('p'))).toBe('toolPath');
    expect(actionForKey(key('g'))).toBe('toolArea');
    expect(actionForKey(key('n'))).toBe('toggleSnap');
    expect(actionForKey(key('l'))).toBe('itemsList');
    expect(actionForKey(key('Escape'))).toBe('cancel');
    expect(actionForKey(key('Enter'))).toBe('finish');
    expect(actionForKey(key('Backspace'))).toBe('backspace');
  });

  it('ignores other keys and plain letters with Ctrl', () => {
    expect(actionForKey(key('q'))).toBeNull();
    expect(actionForKey(key('v', { ctrlKey: true }))).toBeNull();
    expect(actionForKey(key('ArrowLeft'))).toBeNull();
  });
});

describe('SHORTCUTS', () => {
  it('lists every action once, so every tool has a shortcut in the sheet', () => {
    const actions = SHORTCUTS.map((shortcut) => shortcut.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual(
      expect.arrayContaining(['toolSelect', 'toolPath', 'toolArea', 'toggleSnap', 'itemsList']),
    );
    expect(actions).toContain('camera');
  });
});
