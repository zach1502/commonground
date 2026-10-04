import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useNavigation,
  useRouteLoaderData,
  useSubmit,
} from 'react-router';

import {
  Footer,
  Header,
  NavigationProvider,
  SKELETON_DELAY_MS,
  SiteNav,
  SkeletonReveal,
  SkipLink,
  type SiteNavAccount,
} from '@parkshape/ui';

import type { User } from '../api/web-api';
import { messages } from '../messages';
import { PATHS } from '../routing/paths';

import { RouteAnnouncer } from './route-announcer';
import { revealFor, RouteSkeleton, skeletonKindFor } from './route-skeleton';

export const ROOT_ROUTE_ID = 'root';
export const MAIN_ID = 'main-content';

/** Route handle for pages that draw their own bar, such as the editor. */
export const BARE_CHROME = { chrome: 'bare' } as const;

interface ShellHandle {
  readonly chrome?: string;
}

function navItems(user: User | null) {
  const { app } = messages;
  if (user === null) {
    return [
      <NavLink key="projects" to={PATHS.projects}>
        {app.navProjects}
      </NavLink>,
      <NavLink key="login" to={PATHS.login}>
        {app.navLogin}
      </NavLink>,
    ];
  }
  // Staff stays the current item on every staff page, so the nav reads the same in the wizard.
  return user.role === 'staff'
    ? [
        <NavLink key="staff" to={PATHS.staff}>
          {app.navStaff}
        </NavLink>,
      ]
    : [
        <NavLink key="projects" to={PATHS.projects}>
          {app.navProjects}
        </NavLink>,
      ];
}

function useAccount(user: User | null): SiteNavAccount | undefined {
  const submit = useSubmit();
  if (user === null) return undefined;
  return {
    name: user.displayName,
    logoutLabel: messages.app.navLogout,
    onLogout: () => {
      void submit(null, { method: 'post', action: PATHS.logout });
    },
  };
}

function useBareChrome(): boolean {
  return useMatches().some(
    (match) => (match.handle as ShellHandle | undefined)?.chrome === BARE_CHROME.chrome,
  );
}

/** The path the router is loading, once the wait has passed 1 s; null otherwise. */
function useSlowNavigation(): string | null {
  const navigation = useNavigation();
  const location = useLocation();
  const target = navigation.state === 'loading' ? navigation.location.pathname : null;
  const pending = target !== null && target !== location.pathname ? target : null;
  const [slow, setSlow] = useState<string | null>(null);
  useEffect(() => {
    setSlow(null);
    if (pending === null) return undefined;
    const handle = window.setTimeout(() => {
      setSlow(pending);
    }, SKELETON_DELAY_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [pending]);
  return slow;
}

function SiteHeader({ user }: { readonly user: User | null }) {
  const { app } = messages;
  const account = useAccount(user);
  return (
    <Header
      title={app.name}
      skipLinkLabel={app.skipLink}
      mainId={MAIN_ID}
      statusLabel={app.demoStatus}
      homeLinkElement={<Link to={PATHS.home} />}
    >
      <SiteNav label={app.navLabel} menuLabel={app.menu} items={navItems(user)} account={account} />
    </Header>
  );
}

/**
 * The page frame: skip link, header with the wordmark and navigation, main landmark and footer.
 * The editor draws its own bar and fills the window, so it gets only the skip link and no
 * footer. A load that takes over 1 s shows grey blocks in the shape of the next page.
 */
export function AppShell() {
  const navigate = useNavigate();
  const data = useRouteLoaderData<{ user: User | null }>(ROOT_ROUTE_ID);
  const user = data?.user ?? null;
  const bare = useBareChrome();
  const slow = useSlowNavigation();
  const skeleton = slow === null ? 'none' : skeletonKindFor(slow);
  const { app } = messages;
  return (
    <NavigationProvider
      navigate={(href) => {
        void navigate(href);
      }}
    >
      <RouteAnnouncer mainId={MAIN_ID} />
      {bare ? <SkipLink targetId={MAIN_ID}>{app.skipLink}</SkipLink> : <SiteHeader user={user} />}
      <main id={MAIN_ID} className="web-main" tabIndex={-1}>
        <RouteSkeleton kind={skeleton} delayMs={0} />
        <SkeletonReveal
          className="web-outlet"
          state={skeleton === 'none' ? 'ready' : 'waiting'}
          reveal={revealFor(skeleton)}
        >
          <Outlet />
        </SkeletonReveal>
      </main>
      {bare ? null : <Footer sourcesLabel={app.sourcesLink}>{app.attribution}</Footer>}
    </NavigationProvider>
  );
}
