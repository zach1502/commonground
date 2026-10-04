import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { historyStorageKey } from '@parkshape/scene/editor';

import {
  applyChange,
  loadWizard,
  saveWizard,
  WIZARD_BASELINE_ID,
  WIZARD_STORAGE_KEY,
  type WizardState,
} from './wizard-state';

export interface WizardApi {
  readonly state: WizardState;
  readonly update: (change: Partial<WizardState>) => void;
  /** Forgets every stored answer after a publish; the page then leaves the wizard. */
  readonly reset: () => void;
}

const WizardContext = createContext<WizardApi | null>(null);

export interface WizardProviderProps {
  readonly storage: Storage;
  readonly children: ReactNode;
}

/** Holds the wizard's answers and writes each change to sessionStorage. */
export function WizardProvider({ storage, children }: WizardProviderProps) {
  const [state, setState] = useState(() => loadWizard(storage));
  const update = useCallback(
    (change: Partial<WizardState>) => {
      setState((current) => {
        const next = applyChange(current, change);
        // The editor's own copy of the baseline is stale once the features it came from change.
        if ('features' in change || 'locks' in change || 'site' in change) {
          storage.removeItem(historyStorageKey(WIZARD_BASELINE_ID));
        }
        saveWizard(storage, next);
        return next;
      });
    },
    [storage],
  );
  const reset = useCallback(() => {
    storage.removeItem(WIZARD_STORAGE_KEY);
    storage.removeItem(historyStorageKey(WIZARD_BASELINE_ID));
  }, [storage]);
  const value = useMemo(() => ({ state, update, reset }), [state, update, reset]);
  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardApi {
  const wizard = useContext(WizardContext);
  if (wizard === null) throw new Error('useWizard needs a WizardProvider');
  return wizard;
}
