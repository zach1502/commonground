import type { DesignDocument } from '@parkshape/core';

import type { CommandSpec } from './command-schema.js';
import { toCommand } from './commands.js';

/** Undo keeps this many steps; older ones drop off the bottom. */
export const HISTORY_LIMIT = 200;

/** Commands done (oldest first) and commands undone (most recently undone last). */
export interface CommandStack {
  readonly past: readonly CommandSpec[];
  readonly future: readonly CommandSpec[];
}

export interface StackResult {
  readonly stack: CommandStack;
  readonly document: DesignDocument;
}

function empty(): CommandStack {
  return { past: [], future: [] };
}

/** Applies the command and records it; anything that was undone can no longer be redone. */
function push(stack: CommandStack, spec: CommandSpec, document: DesignDocument): StackResult {
  const past = [...stack.past, spec].slice(-HISTORY_LIMIT);
  return { stack: { past, future: [] }, document: toCommand(spec).apply(document) };
}

function undo(stack: CommandStack, document: DesignDocument): StackResult {
  const last = stack.past.at(-1);
  if (last === undefined) return { stack, document };
  return {
    stack: { past: stack.past.slice(0, -1), future: [...stack.future, last] },
    document: toCommand(last).revert(document),
  };
}

function redo(stack: CommandStack, document: DesignDocument): StackResult {
  const next = stack.future.at(-1);
  if (next === undefined) return { stack, document };
  return {
    stack: { past: [...stack.past, next], future: stack.future.slice(0, -1) },
    document: toCommand(next).apply(document),
  };
}

export const commandStack = {
  empty,
  push,
  undo,
  redo,
  canUndo: (stack: CommandStack) => stack.past.length > 0,
  canRedo: (stack: CommandStack) => stack.future.length > 0,
};
