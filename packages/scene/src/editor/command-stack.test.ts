import { describe, expect, it } from 'vitest';

import { commandStack, HISTORY_LIMIT } from './command-stack.js';
import { moveItem, rotateItem } from './commands.js';
import { docOf, treeInput } from './test-fixtures.js';

const start = docOf({ items: [treeInput('t1', 0, 0)] });
const step = (to: number) => moveItem('t1', { x: to - 1, y: 0 }, { x: to, y: 0 });

describe('commandStack', () => {
  it('starts with nothing to undo or redo', () => {
    const stack = commandStack.empty();
    expect(commandStack.canUndo(stack)).toBe(false);
    expect(commandStack.canRedo(stack)).toBe(false);
  });

  it('applies a pushed command and undoes it', () => {
    const pushed = commandStack.push(commandStack.empty(), step(1), start);
    expect(pushed.document.items[0]?.position.x).toBe(1);
    expect(commandStack.canUndo(pushed.stack)).toBe(true);
    const undone = commandStack.undo(pushed.stack, pushed.document);
    expect(undone.document).toEqual(start);
    expect(commandStack.canRedo(undone.stack)).toBe(true);
  });

  it('redoes what was undone', () => {
    const pushed = commandStack.push(commandStack.empty(), step(1), start);
    const undone = commandStack.undo(pushed.stack, pushed.document);
    const redone = commandStack.redo(undone.stack, undone.document);
    expect(redone.document).toEqual(pushed.document);
    expect(commandStack.canRedo(redone.stack)).toBe(false);
  });

  it('clears the redo list when a new command is pushed', () => {
    const first = commandStack.push(commandStack.empty(), step(1), start);
    const undone = commandStack.undo(first.stack, first.document);
    const next = commandStack.push(undone.stack, rotateItem('t1', 0, 15), undone.document);
    expect(commandStack.canRedo(next.stack)).toBe(false);
    expect(next.stack.past).toHaveLength(1);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const stack = commandStack.empty();
    expect(commandStack.undo(stack, start)).toEqual({ stack, document: start });
    expect(commandStack.redo(stack, start)).toEqual({ stack, document: start });
  });

  it('keeps only the most recent commands', () => {
    let state = { stack: commandStack.empty(), document: start };
    for (let index = 1; index <= HISTORY_LIMIT + 5; index += 1) {
      state = commandStack.push(state.stack, step(index), state.document);
    }
    expect(state.stack.past).toHaveLength(HISTORY_LIMIT);
  });
});
