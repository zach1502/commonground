import type { Page } from '@playwright/test';

import { API_URL } from './urls.ts';

export const RESIDENT = 'persona-molly-swingset';
export const STAFF = 'persona-paula-blueprint';

/** Signs the page's browser context in through the API; the cookie is shared. */
export async function signIn(page: Page, persona: string) {
  const response = await page.request.post(`${API_URL}/auth/login`, { data: { persona } });
  if (!response.ok()) {
    throw new Error(`login as ${persona} failed: ${String(response.status())}`);
  }
}
