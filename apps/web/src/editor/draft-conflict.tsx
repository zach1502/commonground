import { Button, InlineAlert } from '@parkshape/ui';

import { messages } from '../messages';

export interface DraftConflictChoice {
  readonly onKeep: () => void;
  readonly onUseSaved: () => void;
}

/** The inline choice after a save found a newer version saved in another tab or device. */
export function DraftConflict({ onKeep, onUseSaved }: DraftConflictChoice) {
  const text = messages.editor;
  return (
    <InlineAlert tone="warning" title={text.save.conflict}>
      <span className="title">{text.save.conflict}</span>
      <span className="ps-alert__action web-editor__conflict">
        <Button variant="secondary" size="small" onPress={onKeep}>
          {text.save.keepMine}
        </Button>
        <Button variant="tertiary" size="small" onPress={onUseSaved}>
          {text.save.useSaved}
        </Button>
      </span>
    </InlineAlert>
  );
}
