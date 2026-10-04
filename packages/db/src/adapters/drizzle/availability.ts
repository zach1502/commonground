import { DatabaseUnavailableError, type Readiness } from '../../ports/availability.js';

/**
 * Error codes that mean the server is gone or unreachable, not that the query was wrong: Node
 * socket errors, postgres-js connection errors, and SQLSTATE 57P01-57P03 (the server is shutting
 * down or starting). Every SQLSTATE in class 08 is a connection exception too.
 */
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECT_TIMEOUT',
  '57P01',
  '57P02',
  '57P03',
]);
const CONNECTION_EXCEPTION_CLASS = '08';
/**
 * admin_shutdown and cannot_connect_now. After a restart, a postgres-js connection that failed
 * during the shutdown answers its next query with the old server's notice before it
 * reconnects, so the query never reached the new server. One immediate rerun fixes that; a
 * server that really is shutting down refuses the rerun too.
 */
const STALE_SHUTDOWN_CODES = new Set(['57P01', '57P03']);
// Drizzle wraps the driver's error once; a little depth covers a wrapper around that.
const MAX_CAUSE_DEPTH = 4;

function errorCode(error: object): string | undefined {
  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' ? code : undefined;
}

/** True when the error, or an error in its cause chain, has a code the test accepts. */
function hasCode(error: unknown, test: (code: string) => boolean): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    const code = errorCode(current);
    if (code !== undefined && test(code)) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** True when the error, or an error in its cause chain, says the connection failed. */
export function isConnectionFailure(error: unknown): boolean {
  return hasCode(error, isConnectionCode);
}

async function rerunAfterStaleShutdown<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!hasCode(error, (code) => STALE_SHUTDOWN_CODES.has(code))) throw error;
    return work();
  }
}

function isConnectionCode(code: string): boolean {
  return CONNECTION_CODES.has(code) || code.startsWith(CONNECTION_EXCEPTION_CLASS);
}

export interface DatabaseGateOptions {
  /** A call that has not settled this long after it started fails as timed out. */
  readonly timeoutMs?: number;
}

type GateState = 'connecting' | 'open' | 'closed';

/**
 * Every repository call passes through here. Before the first migration lands and after close,
 * calls fail at once. Open, a lost connection or a call past the timeout becomes a
 * DatabaseUnavailableError, so a request answers 503 instead of hanging or failing with 500.
 */
export class DatabaseGate {
  private state: GateState = 'connecting';

  constructor(private readonly options: DatabaseGateOptions) {}

  open(): void {
    if (this.state === 'connecting') this.state = 'open';
  }

  close(): void {
    this.state = 'closed';
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (!this.isOpen) throw new DatabaseUnavailableError('not-connected');
    try {
      return await this.withinTimeout(() => rerunAfterStaleShutdown(work));
    } catch (error) {
      if (isConnectionFailure(error)) {
        throw new DatabaseUnavailableError('connection-lost', { cause: error });
      }
      throw error;
    }
  }

  /** Runs a trivial query through the gate and reports what happened. */
  async readiness(ping: () => Promise<unknown>): Promise<Readiness> {
    try {
      await this.run(ping);
      return { kind: 'ready' };
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        return { kind: 'unavailable', reason: error.reason };
      }
      return { kind: 'unavailable', reason: 'connection-lost' };
    }
  }

  private withinTimeout<T>(work: () => Promise<T>): Promise<T> {
    const started = new Promise<T>((resolve) => {
      resolve(work());
    });
    const { timeoutMs } = this.options;
    if (timeoutMs === undefined) return started;
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new DatabaseUnavailableError('timed-out'));
      }, timeoutMs);
    });
    // The losing query may still settle later; nothing waits on it, so it must not go unhandled.
    started.catch(() => undefined);
    return Promise.race([started, expired]).finally(() => {
      clearTimeout(timer);
    });
  }
}

/** The same object, with each method call run through the gate; `this` stays the original. */
export function guardMethods<T extends object>(target: T, gate: DatabaseGate): T {
  return new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        gate.run(() => Promise.resolve(Reflect.apply(value, object, args) as unknown));
    },
  });
}
