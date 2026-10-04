import { handle } from 'hono/vercel';

import { loadConfigFromProcess } from '@parkshape/config';

import { createApp } from './app.js';
import { createApiContainer } from './container.js';

const container = await createApiContainer(loadConfigFromProcess());
const handler = handle(createApp(container.deps));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
