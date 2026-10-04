import { polygonArea, polygonSchema } from '@parkshape/core';

import type { Project } from '../api/web-api';
import { format, messages } from '../messages';

import { deadlineLine } from './project-deadline';

const SQUARE_METRES_PER_HECTARE = 10_000;
const HECTARES = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });

/**
 * The park facts line on a project page: the area from the parcel outline, the neighbourhood for
 * the demo park, whose copy names it, and the closing day from the project's own field.
 */
export function projectFacts(project: Project): string {
  const hectares =
    polygonArea(polygonSchema.parse(project.parcel.polygon)) / SQUARE_METRES_PER_HECTARE;
  const area = format(messages.project.area, { area: HECTARES.format(hectares) });
  const place = project.name === messages.landing.heading ? [messages.landing.line] : [];
  return [area, ...place, deadlineLine(project)].join(' ');
}
