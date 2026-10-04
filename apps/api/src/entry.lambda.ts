import { handle } from 'hono/aws-lambda';

import { loadConfigFromProcess } from '@parkshape/config';

import { createApp } from './app.js';
import { createApiContainer } from './container.js';

const container = await createApiContainer(loadConfigFromProcess());

export const handler = handle(createApp(container.deps));
