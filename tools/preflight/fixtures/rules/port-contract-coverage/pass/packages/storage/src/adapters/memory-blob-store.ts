export class MemoryBlobStore {}

export function createMemoryBlobStore(): MemoryBlobStore {
  return new MemoryBlobStore();
}
