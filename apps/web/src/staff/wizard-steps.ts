import type { WizardState } from './wizard-state';

export const WIZARD_STEPS = [
  'site',
  'terrain',
  'review',
  'parameters',
  'refine',
  'publish',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_BASE = '/staff/projects/new';
export const stepHref = (step: WizardStep) => `${WIZARD_BASE}/${step}`;

const DONE: Readonly<Record<WizardStep, (state: WizardState) => boolean>> = {
  site: (state) => state.site !== null,
  terrain: (state) => state.terrain !== null,
  review: (state) => state.features !== null,
  parameters: (state) => state.parameters !== null,
  refine: (state) => state.baseline !== null,
  publish: () => false,
};

export function isDone(step: WizardStep, state: WizardState): boolean {
  return DONE[step](state);
}

export function doneSteps(state: WizardState): WizardStep[] {
  return WIZARD_STEPS.filter((step) => isDone(step, state));
}

/** The first step whose answers are missing; later steps wait for it. */
export function firstOpenStep(state: WizardState): WizardStep {
  return WIZARD_STEPS.find((step) => !isDone(step, state)) ?? 'publish';
}

/** Whether every step before this one is done, so the step has what it needs. */
export function canOpen(step: WizardStep, state: WizardState): boolean {
  return WIZARD_STEPS.slice(0, WIZARD_STEPS.indexOf(step)).every((before) => isDone(before, state));
}

export function nextStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + 1] ?? 'publish';
}

export function previousStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index > 0 ? (WIZARD_STEPS[index - 1] ?? null) : null;
}
