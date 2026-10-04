import '@parkshape/ui/styles.css';
import './fonts.css';
import './web.css';
import './web-editor.css';
import './web-skeleton.css';
import './participation.css';
import './design.css';
import './review.css';
import './leaderboard.css';
import './planner.css';
import './describe.css';
import './insights.css';
import './feedback.css';
import './brief.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { loadBrowserConfigFromVite } from '@parkshape/config/browser';

import { createWebDeps } from './app-deps';
import { createAppRouter } from './routes';

const ROOT_ELEMENT_ID = 'root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) {
  throw new Error(`Missing #${ROOT_ELEMENT_ID} element in index.html`);
}

const router = createAppRouter(
  createWebDeps(loadBrowserConfigFromVite(), {
    local: window.localStorage,
    session: window.sessionStorage,
  }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
