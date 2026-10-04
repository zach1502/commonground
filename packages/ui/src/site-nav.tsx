import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import { Button } from './button.js';

/** The signed-in visitor: their name as plain text, then a log out control. */
export interface SiteNavAccount {
  readonly name: string;
  readonly logoutLabel: string;
  readonly onLogout: () => void;
}

export interface SiteNavProps {
  readonly label: string;
  readonly menuLabel: string;
  readonly items: readonly ReactElement[];
  readonly account?: SiteNavAccount | undefined;
}

function AccountItem({ account }: { readonly account: SiteNavAccount }) {
  return (
    <li className="ps-nav__item ps-nav__account">
      <span className="ps-nav__name">{account.name}</span>
      <button type="button" className="ps-nav__link" onClick={account.onLogout}>
        {account.logoutLabel}
      </button>
    </li>
  );
}

/** Site navigation. Under 768 px the list folds behind a menu button; Esc closes it. */
export function SiteNav({ label, menuLabel, items, account }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const toggle = useRef<HTMLSpanElement>(null);
  const state = open ? 'true' : 'false';
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    setOpen(false);
    toggle.current?.querySelector('button')?.focus();
  };
  return (
    <nav aria-label={label} className="ps-nav" data-open={state} onKeyDown={onKeyDown}>
      <span className="ps-nav__toggle" ref={toggle}>
        <Button
          variant="tertiary"
          size="small"
          aria-expanded={state}
          aria-controls={listId}
          onPress={() => {
            setOpen(!open);
          }}
        >
          {menuLabel}
        </Button>
      </span>
      <ul
        id={listId}
        className="ps-nav__list"
        onClick={() => {
          setOpen(false);
        }}
      >
        {items.map((item) => (
          <li key={item.key} className="ps-nav__item">
            {item}
          </li>
        ))}
        {account === undefined ? null : <AccountItem account={account} />}
      </ul>
    </nav>
  );
}
