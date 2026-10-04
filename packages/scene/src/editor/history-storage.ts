import { z } from 'zod';

import { designDocumentSchema, type DesignDocument } from '@parkshape/core';

import { commandSpecSchema } from './command-schema.js';
import type { CommandStack } from './command-stack.js';

export interface EditorSession {
  readonly document: DesignDocument;
  readonly history: CommandStack;
}

const sessionSchema = z.strictObject({
  document: designDocumentSchema,
  history: z.strictObject({
    past: z.array(commandSpecSchema),
    future: z.array(commandSpecSchema),
  }),
});

export function historyStorageKey(designId: string): string {
  return `parkshape.history.${designId}`;
}

/** The document is stored beside the history so undo always starts from the state it expects. */
export function serialiseSession(session: EditorSession): string {
  return JSON.stringify(session);
}

export function parseSession(stored: string | null): EditorSession | null {
  if (stored === null) return null;
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
