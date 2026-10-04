/** Stores provider answers by input hash. Values come back unchecked; callers parse them. */
export interface Cache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
