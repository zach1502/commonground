import { useId } from 'react';

import { Badge } from './badge.js';
import { Button } from './button.js';
import { Inline } from './layout.js';

export interface BcServicesCardButtonProps {
  readonly label: string;
  /** The tag beside the button that says this login is a mock, such as "Demo". */
  readonly demoTag: string;
  readonly onPress?: () => void;
  readonly isPending?: boolean;
  readonly type?: 'button' | 'submit';
}

/** The demo login button, with a tag that marks the login as a mock. */
export function BcServicesCardButton({ label, demoTag, ...rest }: BcServicesCardButtonProps) {
  const tagId = useId();
  return (
    <Inline gap="small">
      <Button {...rest} variant="primary" aria-describedby={tagId}>
        {label}
      </Button>
      <Badge tone="info" id={tagId}>
        {demoTag}
      </Badge>
    </Inline>
  );
}
