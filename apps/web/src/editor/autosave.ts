/** DESIGN.md: every change saves automatically; this is the pause after the last change. */
export const AUTOSAVE_DELAY_MS = 500;
/** How long a save paused by a lost link waits before it tries again on its own. */
export const AUTOSAVE_RETRY_MS = 2000;

/**
 * "paused" is a lost link, and the change is kept; "failed" is a save the server refused;
 * "signedOut" is a save refused because the session ended, and the draft is kept for sign-in;
 * "conflict" is a save refused because the draft was saved elsewhere, and the reader chooses.
 */
export type SaveStatus =
  'saved' | 'pending' | 'saving' | 'paused' | 'failed' | 'signedOut' | 'conflict';

export type SaveFailure = Extract<SaveStatus, 'paused' | 'failed' | 'signedOut' | 'conflict'>;

/** The reader's answer to a conflict: send this tab's change anyway, or drop it. */
export type ConflictChoice = 'keep' | 'discard';

export interface AutosaveOptions<T> {
  readonly save: (value: T) => Promise<void>;
  readonly onStatus: (status: SaveStatus) => void;
  /** Sorts an error into a lost link, a refusal or a conflict; a refusal by default. */
  readonly classify?: (error: unknown) => SaveFailure;
}

export interface Autosave<T> {
  /** A paused or conflict status stays until it clears, so the reader keeps the explanation. */
  schedule(value: T): void;
  /** Saves a pending change now, after any save in flight, and answers with the status. */
  flush(): Promise<SaveStatus>;
  /** Sends a change kept by a paused save now, for example when the browser is back online. */
  retry(): Promise<void>;
  /** Ends a conflict with the reader's choice. */
  resolve(choice: ConflictChoice): Promise<SaveStatus>;
  dispose(): void;
}

interface Slot<T> {
  readonly value: T;
}

/** One timer at a time: a later schedule replaces the earlier one. */
function createTimer() {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
  };
  const later = (task: () => Promise<unknown>, ms: number) => {
    clear();
    handle = setTimeout(() => void task(), ms);
  };
  return { clear, later };
}

/** The change waiting to go out, and the one a failed save kept for a retry. */
function createSlots<T>() {
  let pending: Slot<T> | null = null;
  let kept: Slot<T> | null = null;
  return {
    set(value: T) {
      pending = { value };
      kept = null;
    },
    take(): Slot<T> | null {
      const attempt = pending;
      pending = null;
      kept = null;
      return attempt;
    },
    keep(attempt: Slot<T>) {
      kept = attempt;
    },
    /** Puts the kept change back, unless a newer one is already waiting. */
    restore() {
      pending ??= kept;
      kept = null;
    },
    // Read through a function: a change can arrive while a save is in flight.
    waiting: () => pending !== null,
    clear() {
      pending = null;
      kept = null;
    },
    /** A conflict's end: "keep" puts the change back to send, "discard" drops it. */
    settle(choice: ConflictChoice) {
      if (choice === 'keep') this.restore();
      else this.clear();
    },
  };
}

/** The status the reader sees; a repeat of the same status is not reported again. */
function createReporter(onStatus: (status: SaveStatus) => void) {
  let status: SaveStatus = 'saved';
  return {
    current: () => status,
    report: (next: SaveStatus) => {
      if (next !== status) onStatus(next);
      status = next;
    },
  };
}

type Reporter = ReturnType<typeof createReporter>;
type Timer = ReturnType<typeof createTimer>;
type Slots<T> = ReturnType<typeof createSlots<T>>;

interface SaverDeps<T> {
  readonly save: (value: T) => Promise<void>;
  readonly slots: Slots<T>;
  readonly reporter: Reporter;
  readonly timer: Timer;
  readonly classify: (error: unknown) => SaveFailure;
  readonly retry: () => Promise<void>;
}

/** Runs one save attempt: reports "saving", stores the stamp, or sorts the error into a status. */
function createSaver<T>(deps: SaverDeps<T>): () => Promise<SaveStatus> {
  const { save, slots, timer, classify, retry } = deps;
  const { current, report } = deps.reporter;
  const fail = (attempt: Slot<T>, error: unknown) => {
    const failure = classify(error);
    report(failure);
    // A refusal or a signed-out session keeps the draft in the store but never retries on its own.
    if (failure === 'failed' || failure === 'signedOut') return;
    slots.keep(attempt);
    if (failure === 'paused' && !slots.waiting()) timer.later(retry, AUTOSAVE_RETRY_MS);
  };
  return async (): Promise<SaveStatus> => {
    const attempt = current() === 'conflict' ? null : slots.take();
    if (attempt === null) return current();
    report('saving');
    try {
      await save(attempt.value);
      report(slots.waiting() ? 'pending' : 'saved');
    } catch (error) {
      fail(attempt, error);
    }
    return current();
  };
}

/**
 * Debounces saves so a drag or a burst of edits sends one request, and sends one at a time: a
 * save waits for the one in flight, so it carries the stamp that save returned.
 */
export function createAutosave<T>({
  save,
  onStatus,
  classify = () => 'failed',
}: AutosaveOptions<T>): Autosave<T> {
  const slots = createSlots<T>();
  const reporter = createReporter(onStatus);
  const { current, report } = reporter;
  let inFlight: Promise<SaveStatus> = Promise.resolve(current());
  const timer = createTimer();
  const send = createSaver({ save, slots, reporter, timer, classify, retry: () => retry() });
  const flush = (): Promise<SaveStatus> => {
    timer.clear();
    inFlight = inFlight.then(send);
    return inFlight;
  };
  async function retry(): Promise<void> {
    if (current() === 'conflict') return;
    slots.restore();
    await flush();
  }
  const resolve = (choice: ConflictChoice): Promise<SaveStatus> => {
    slots.settle(choice);
    report(choice === 'discard' ? 'saved' : 'pending');
    return flush();
  };
  const schedule = (value: T) => {
    slots.set(value);
    if (current() === 'conflict') return;
    if (current() !== 'paused') report('pending');
    timer.later(flush, AUTOSAVE_DELAY_MS);
  };
  return {
    schedule,
    flush,
    retry,
    resolve,
    dispose: () => {
      timer.clear();
      slots.clear();
    },
  };
}
