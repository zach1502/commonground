/** Whether one constraint is met, with the number it was judged on and a message for residents. */
export interface ConstraintOutcome {
  readonly met: boolean;
  readonly value: number;
  readonly limit: number;
  readonly message: string;
}

/** A constraint that is met when nothing is wrong: value counts the problems, the limit is 0. */
export function problemCountOutcome(
  problems: readonly string[],
  metMessage: string,
): ConstraintOutcome {
  const [first] = problems;
  return {
    met: first === undefined,
    value: problems.length,
    limit: 0,
    message: first ?? metMessage,
  };
}
