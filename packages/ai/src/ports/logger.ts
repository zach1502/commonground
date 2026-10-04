/** Where the AI package reports a fallback. Messages never include resident text or keys. */
export interface Logger {
  warn(message: string): void;
}
