/** Source of the current time; inject it so time-dependent logic stays testable. */
export interface Clock {
  now(): Date;
}
