import type { Repositories } from '@parkshape/db';
import { InMemoryBlobStore, type BlobStore, type StoredBlob } from '@parkshape/storage';

/** A competing write the test runs inside a request, between one step and the next. */
export type Between = () => Promise<void>;

type RepositoryName = keyof Repositories;
type Moment = 'before' | 'after';

interface ArmedWindow {
  readonly moment: Moment;
  readonly between: Between;
}

/**
 * Race windows armed by a test. Each one fires once, at the next call of the named repository
 * method, and runs its competing write to completion before (or after) that call reaches the
 * database. Nothing sleeps, so the interleaving is the same on every run.
 */
export class RaceWindows {
  private readonly armed = new Map<string, ArmedWindow>();

  /** Runs `between` just before the next call of `repository.method`. */
  before(repository: RepositoryName, method: string, between: Between): void {
    this.armed.set(`${repository}.${method}`, { moment: 'before', between });
  }

  /** Runs `between` once the next call of `repository.method` has returned. */
  after(repository: RepositoryName, method: string, between: Between): void {
    this.armed.set(`${repository}.${method}`, { moment: 'after', between });
  }

  /** The same repositories, with each method able to open an armed window. */
  wrap(inner: Repositories): Repositories {
    return {
      users: this.wrapOne('users', inner.users),
      projects: this.wrapOne('projects', inner.projects),
      designs: this.wrapOne('designs', inner.designs),
      votes: this.wrapOne('votes', inner.votes),
      elementComments: this.wrapOne('elementComments', inner.elementComments),
    };
  }

  private take(key: string): ArmedWindow | undefined {
    const window = this.armed.get(key);
    this.armed.delete(key);
    return window;
  }

  private wrapOne<T extends object>(name: RepositoryName, target: T): T {
    return new Proxy(target, {
      get: (object, property) => {
        const value: unknown = Reflect.get(object, property);
        if (typeof value !== 'function' || typeof property !== 'string') return value;
        return async (...args: unknown[]) => {
          const window = this.take(`${name}.${property}`);
          if (window?.moment === 'before') await window.between();
          const result: unknown = await Reflect.apply(value, object, args);
          if (window?.moment === 'after') await window.between();
          return result;
        };
      },
    });
  }
}

/** An in-memory blob store that can run one competing write right after a put lands. */
export class WindowedBlobStore implements BlobStore {
  private readonly inner = new InMemoryBlobStore({ baseUrl: 'http://localhost:8787/blobs' });
  private afterNextPut: Between | undefined;
  readonly putKeys: string[] = [];

  afterPut(between: Between): void {
    this.afterNextPut = between;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.inner.put(key, bytes, contentType);
    this.putKeys.push(key);
    const between = this.afterNextPut;
    this.afterNextPut = undefined;
    if (between !== undefined) await between();
  }

  get(key: string): Promise<StoredBlob | undefined> {
    return this.inner.get(key);
  }

  url(key: string): string {
    return this.inner.url(key);
  }
}
