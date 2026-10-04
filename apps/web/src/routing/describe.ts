import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

import type { Design, DescribeInput, Project } from '../api/web-api';
import type { WebDeps } from '../app-deps';

import { notFoundOn404, type Loaders } from './loaders';
import { NotFoundError } from './not-found';
import { PATHS } from './paths';

const TEXT_PARAM = 'text';

export interface DescribeData {
  readonly project: Project;
}

export interface PreviewData {
  readonly project: Project;
  readonly design: Design;
  /** The description the draft came from, kept so Try another arrangement can reuse it. */
  readonly text: string;
}

export interface DescribeError {
  readonly error: 'describe-failed';
}

/** The preview address, with the description in the query so the page can try again. */
export function previewHref(projectId: string, designId: string, text: string): string {
  const query = new URLSearchParams({ [TEXT_PARAM]: text });
  return `${PATHS.describePreview(projectId, designId)}?${query.toString()}`;
}

type Deps = Pick<WebDeps, 'api' | 'describeIt'>;

function requireDescribeIt(deps: Deps): void {
  if (deps.describeIt === 'off') throw new NotFoundError();
}

/** Loaders for the Describe it page and its preview. Both are hidden when the flag is off. */
export function describeLoaders(deps: Deps, loaders: Pick<Loaders, 'sessionFor'>) {
  const { api } = deps;
  return {
    describe: async ({ params }: Pick<LoaderFunctionArgs, 'params'>) => {
      requireDescribeIt(deps);
      const user = await loaders.sessionFor('resident');
      if (user instanceof Response) return user;
      return { project: await notFoundOn404(() => api.getProject(params.id ?? '')) };
    },
    describePreview: async ({
      params,
      request,
    }: Pick<LoaderFunctionArgs, 'params' | 'request'>) => {
      requireDescribeIt(deps);
      const user = await loaders.sessionFor('resident');
      if (user instanceof Response) return user;
      const [project, design] = await notFoundOn404(() =>
        Promise.all([api.getProject(params.id ?? ''), api.getDesign(params.designId ?? '')]),
      );
      const text = new URL(request.url).searchParams.get(TEXT_PARAM) ?? '';
      return { project, design, text } satisfies PreviewData;
    },
  };
}

/** Generates a draft from a description, then shows its preview. */
export function describeAction({ api }: Pick<WebDeps, 'api'>) {
  return async ({
    request,
    params,
  }: Pick<ActionFunctionArgs, 'request' | 'params'>): Promise<DescribeError | Response> => {
    const projectId = params.id ?? '';
    const input = (await request.json()) as DescribeInput;
    try {
      const design = await api.describeDesign(projectId, input);
      return redirect(previewHref(projectId, design.id, input.text));
    } catch {
      return { error: 'describe-failed' };
    }
  };
}
