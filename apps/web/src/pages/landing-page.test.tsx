import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const DESKTOP_PX = 1440;
const PHONE_PX = 360;
const DESIGNS = 3;

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeEach(async () => {
  const project = await projectFixture({ phase: 'open' });
  const designs = Array.from({ length: DESIGNS }, (_, index) => ({
    id: `d${String(index)}`,
    up: 2,
    down: 1,
  }));
  apiServer.use(
    http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    http.get(`${TEST_API_URL}/projects/jrp/designs`, () => HttpResponse.json({ designs })),
  );
});

afterEach(() => {
  setWidth(DESKTOP_PX);
});

async function openLanding() {
  renderApp(PATHS.home);
  await screen.findByRole('heading', { level: 1, name: messages.landing.heading });
}

describe('landing page', () => {
  it('shows the park picture with no narrating caption', async () => {
    setWidth(DESKTOP_PX);
    await openLanding();
    const figure = screen.getByRole('figure');
    expect(
      within(figure).getByRole('img', { name: messages.landing.imageAlt }),
    ).toBeInTheDocument();
    expect(figure.querySelector('figcaption')).toBeNull();
  });

  it('links the design count to the gallery', async () => {
    await openLanding();
    const link = await screen.findByRole('link', { name: '3 designs' });
    expect(link).toHaveAttribute('href', PATHS.gallery('jrp'));
    expect(link.closest('p')).toHaveTextContent('3 designs, 9 votes');
  });

  it('offers no About link, since the page is gone', async () => {
    await openLanding();
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('link', { name: /^about/i })).toBeNull();
  });

  it('fills Design a park on a desktop', async () => {
    setWidth(DESKTOP_PX);
    await openLanding();
    expect(screen.getByRole('link', { name: messages.landing.design })).toHaveClass('primary');
    expect(screen.getByRole('link', { name: messages.landing.vote })).toHaveClass('secondary');
  });

  it('keeps Design a park filled on a phone too, so the primary does not swap', async () => {
    setWidth(PHONE_PX);
    await openLanding();
    expect(screen.getByRole('link', { name: messages.landing.design })).toHaveClass('primary');
    expect(screen.getByRole('link', { name: messages.landing.vote })).toHaveClass('secondary');
  });
});
