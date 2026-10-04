import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigation } from 'react-router';

/**
 * After a client-side route change, screen-reader and keyboard users are otherwise left on the
 * old control or on `body`. This moves focus to the new page's `h1` (or the `main` landmark when a
 * page has none) and names the page once through one polite live region (`aria-live="polite"`, no
 * `role` so it never competes with a page's own `role="status"`). It does not act on the first page
 * load, where focus at `body` and the near-top skip link are expected (a11y-experience.md A1;
 * DESIGN.md "Feedback and failure"; WCAG 2.4.3, 4.1.3).
 */
export function RouteAnnouncer({ mainId }: { readonly mainId: string }) {
  const location = useLocation();
  const navigation = useNavigation();
  const [message, setMessage] = useState('');
  const lastHandled = useRef<string | null>(null);
  const seenFirst = useRef(false);
  const key = location.key;
  const settled = navigation.state === 'idle';
  useEffect(() => {
    if (!settled) return;
    if (lastHandled.current === key) return;
    lastHandled.current = key;
    if (!seenFirst.current) {
      // First settle is the initial load; do not steal focus from the top of the page.
      seenFirst.current = true;
      return;
    }
    const main = document.getElementById(mainId);
    const target = main?.querySelector('h1') ?? main;
    if (target !== null) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus();
    }
    // The destination page sets document.title in its own effect, which runs after this one, so
    // read the title on the next tick to name the page that just loaded, not the last one.
    const timer = window.setTimeout(() => {
      setMessage(document.title);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [key, settled, mainId]);
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      data-testid="route-announcer"
      className="ps-visually-hidden"
    >
      {message}
    </div>
  );
}
