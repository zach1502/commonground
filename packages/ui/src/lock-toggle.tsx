export type LockState = 'locked' | 'unlocked';

export interface LockToggleProps {
  readonly state: LockState;
  /** The accessible name, such as "Lock Western red cedar 274374". */
  readonly label: string;
  /** The visible switch label, such as "Lock". */
  readonly text: string;
  readonly onChange: (next: LockState) => void;
}

/**
 * A switch that locks an existing feature so designs must keep it. It is a pressed-or-not
 * button, and the track shows the state, so the column keeps one width.
 */
export function LockToggle({ state, label, text, onChange }: LockToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={state === 'locked' ? 'true' : 'false'}
      className="ps-switch"
      onClick={() => {
        onChange(state === 'locked' ? 'unlocked' : 'locked');
      }}
    >
      <span className="ps-switch__track" aria-hidden="true">
        <span className="ps-switch__thumb" />
      </span>
      <span className="ps-switch__text">{text}</span>
    </button>
  );
}
