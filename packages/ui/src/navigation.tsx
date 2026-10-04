import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

export type Navigate = (href: string) => void;

const NavigationContext = createContext<Navigate | null>(null);

export interface NavigationProviderProps {
  readonly navigate: Navigate;
  readonly children: ReactNode;
}

/** Lets ui links hand in-app moves to the app router instead of loading a new page. */
export function NavigationProvider({ navigate, children }: NavigationProviderProps) {
  return <NavigationContext.Provider value={navigate}>{children}</NavigationContext.Provider>;
}

const PRIMARY_BUTTON = 0;

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === PRIMARY_BUTTON &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** A click handler that routes plain clicks through the provider, when there is one. */
export function useLinkClick(href: string) {
  const navigate = useContext(NavigationContext);
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (navigate !== null && isPlainClick(event)) {
      event.preventDefault();
      navigate(href);
    }
  };
}
