import { blobStoreContract } from '../ports/__contracts__/blob-store.contract.js';

import { createMemoryBlobStore, MemoryBlobStore } from './memory-blob-store.js';

blobStoreContract('MemoryBlobStore', () => createMemoryBlobStore());
void MemoryBlobStore;
