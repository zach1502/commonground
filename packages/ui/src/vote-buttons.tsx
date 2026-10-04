import { Button } from './button.js';

export interface VoteButtonsProps {
  readonly upLabel: string;
  readonly downLabel: string;
  readonly skipLabel: string;
  readonly onUp: () => void;
  readonly onDown: () => void;
  readonly onSkip: () => void;
  readonly isDisabled?: boolean;
  /** The vote just cast; its button keeps the pressed colour while the reasons are open. */
  readonly chosen?: 'up' | 'down' | null;
}

/**
 * The three vote actions in the thumb zone, equal in width. Up is the one primary action; down
 * and skip are secondary, so neither choice reads as an error. Each is 44 px tall or more.
 */
export function VoteButtons({
  upLabel,
  downLabel,
  skipLabel,
  onUp,
  onDown,
  onSkip,
  isDisabled = false,
  chosen = null,
}: VoteButtonsProps) {
  const held = (vote: 'up' | 'down') => (chosen === vote ? 'held' : 'rest');
  return (
    <div className="ps-vote-buttons">
      <Button variant="secondary" onPress={onSkip} isDisabled={isDisabled}>
        {skipLabel}
      </Button>
      <Button variant="secondary" onPress={onDown} isDisabled={isDisabled} held={held('down')}>
        {downLabel}
      </Button>
      <Button variant="primary" onPress={onUp} isDisabled={isDisabled} held={held('up')}>
        {upLabel}
      </Button>
    </div>
  );
}
