import { isRouteErrorResponse, Link, useRevalidator, useRouteError } from 'react-router';

import { Button, Inline, PageTitle, Stack } from '@parkshape/ui';

import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { NotFoundError } from '../routing/not-found';
import { PATHS } from '../routing/paths';
import { bootKindFor, RouteSkeleton, skeletonDelayAt } from '../shell/route-skeleton';

const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundError || (isRouteErrorResponse(error) && error.status === NOT_FOUND)
  );
}

/** Loads the page again; a failed request can work the second time. */
function RetryButton() {
  const revalidator = useRevalidator();
  return (
    <Button
      isPending={revalidator.state === 'loading'}
      onPress={() => {
        void revalidator.revalidate();
      }}
    >
      {messages.errors.retry}
    </Button>
  );
}

/**
 * A plain recovery message inside the page frame: what happened, then what to do. A missing page
 * links home; any other failure offers Try again first.
 */
export function ErrorPage() {
  const error = useRouteError();
  const notFound = isNotFound(error);
  const { errors } = messages;
  useDocumentMeta(notFound ? messages.meta.notFound : messages.meta.error);
  return (
    <Stack gap="large" className="web-page">
      {notFound ? null : (
        <p role="alert" className="ps-visually-hidden">
          {messages.failure.pageLoad}
        </p>
      )}
      <PageTitle lede={notFound ? errors.notFoundBody : errors.body}>
        {notFound ? errors.notFoundHeading : errors.heading}
      </PageTitle>
      <Inline gap="large">
        {notFound ? null : <RetryButton />}
        <Link to={PATHS.home}>{errors.home}</Link>
        {notFound ? <Link to={PATHS.projects}>{errors.projects}</Link> : null}
      </Inline>
    </Stack>
  );
}

/** Shown when the frame itself cannot load, for example when the API is down. */
export function RootErrorPage() {
  return (
    <main id="main-content">
      <ErrorPage />
    </main>
  );
}

/**
 * Holds the page while the first loaders run. The 1 s wait counts from navigation, not from when
 * the script arrived, so on a slow link the shape shows at once and the boot shell never blinks.
 */
export function LoadingPage() {
  return (
    <main id="main-content" aria-busy="true">
      <RouteSkeleton
        kind={bootKindFor(window.location.pathname)}
        delayMs={skeletonDelayAt(performance.now())}
      />
    </main>
  );
}
