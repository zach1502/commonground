import { Navigate, Outlet, useLocation } from 'react-router';

import { PageTitle, Stepper } from '@parkshape/ui';

import type { WebDeps } from '../app-deps';
import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';

import { useWizard, WizardProvider } from './wizard-context';
import {
  canOpen,
  doneSteps,
  firstOpenStep,
  stepHref,
  WIZARD_STEPS,
  type WizardStep,
} from './wizard-steps';

const strings = messages.planner.wizard;

function stepAt(pathname: string): WizardStep {
  const last = pathname
    .split('/')
    .filter((part) => part !== '')
    .pop();
  return WIZARD_STEPS.find((step) => step === last) ?? 'site';
}

function WizardFrame() {
  const { state } = useWizard();
  const step = stepAt(useLocation().pathname);
  useDocumentMeta(messages.plannerMeta[step]);
  if (!canOpen(step, state)) return <Navigate to={stepHref(firstOpenStep(state))} replace />;
  return (
    <div className="web-page web-wizard">
      <PageTitle>{strings.heading}</PageTitle>
      <Stepper
        label={strings.stepsLabel}
        steps={WIZARD_STEPS.map((id) => ({ id, label: strings.steps[id], href: stepHref(id) }))}
        currentId={step}
        doneIds={doneSteps(state)}
        doneText={strings.done}
      />
      <Outlet />
    </div>
  );
}

/** The six-step project setup: step list, then the current step; answers live in the session. */
export function WizardLayout({ deps }: { readonly deps: Pick<WebDeps, 'editor'> }) {
  return (
    <WizardProvider storage={deps.editor.storage.session}>
      <WizardFrame />
    </WizardProvider>
  );
}
