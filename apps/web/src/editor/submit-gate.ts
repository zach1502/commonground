import { failedConstraints, type MetricsReport } from '@parkshape/core';

/** The id of the problem list, so Submit can move focus to it. */
export const PROBLEMS_ID = 'editor-problems';

/**
 * What Submit does. It stays enabled: with a failing hard rule it sends focus to the problem list,
 * which says why; otherwise it opens the dialog. While the meters are still working the server
 * decides.
 */
export function submitStep(report: MetricsReport | null): 'problems' | 'dialog' {
  if (report === null) return 'dialog';
  return failedConstraints(report).length > 0 ? 'problems' : 'dialog';
}

/** Runs Submit: focus the problem list when a hard rule fails, or else open the dialog. */
export function pressSubmit(report: MetricsReport | null, openDialog: () => void): void {
  if (submitStep(report) === 'problems') {
    document.getElementById(PROBLEMS_ID)?.focus();
    return;
  }
  openDialog();
}
