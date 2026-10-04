import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { apiServer, session } from './test/api-server';

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  apiServer.resetHandlers();
  session.user = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.head.querySelectorAll('meta').forEach((meta) => {
    meta.remove();
  });
});

afterAll(() => {
  apiServer.close();
});
