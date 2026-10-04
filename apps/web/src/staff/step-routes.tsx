import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { WebDeps } from '../app-deps';

import type { WizardStep } from './wizard-steps';

type StepComponent = ComponentType<{ readonly deps: WebDeps }>;
type LazyRoute = NonNullable<RouteObject['lazy']>;

const STEP_MODULES: Readonly<Record<WizardStep, () => Promise<StepComponent>>> = {
  site: async () => (await import('./step-site')).SiteStep,
  terrain: async () => (await import('./step-terrain')).TerrainStep,
  review: async () => (await import('./step-review')).ReviewStep,
  parameters: async () => (await import('./step-parameters')).ParametersStep,
  refine: async () => (await import('./step-refine')).RefineStep,
  publish: async () => (await import('./step-publish')).PublishStep,
};

/** A lazy route module for one wizard step, so each step loads only when opened. */
export function stepPage(deps: WebDeps, step: WizardStep): LazyRoute {
  return async () => {
    const Step = await STEP_MODULES[step]();
    function StepWithDeps() {
      return <Step deps={deps} />;
    }
    return { Component: StepWithDeps };
  };
}
