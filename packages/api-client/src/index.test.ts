import { describe, expect, it } from 'vitest';

import { apiUrl } from './index.js';

describe('apiUrl', () => {
  it('joins base and path without doubling slashes', () => {
    expect(apiUrl('http://localhost:8787', '/health')).toBe('http://localhost:8787/health');
    expect(apiUrl('https://api.example/v1/', 'health')).toBe('https://api.example/v1/health');
  });
});
