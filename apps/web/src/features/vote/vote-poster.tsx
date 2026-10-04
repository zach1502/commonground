import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';
import { documentPropertyReader, readPalette } from '@parkshape/scene/plan';
import { InlineAlert, Skeleton, SkeletonBlock } from '@parkshape/ui';

import type { DesignSummary } from '../../api/web-api';
import { format, messages } from '../../messages';

// React 18 passes only the lowercase attribute through to the DOM.
const HIGH_PRIORITY: Readonly<Record<string, string>> = { fetchpriority: 'high' };

/** The 3D view's sky, so the space around a plan poster matches the 3D background. */
function sceneSky(): string {
  return readPalette(documentPropertyReader()).sky;
}

export type PosterSource = Pick<DesignSummary, 'title' | 'thumbnailUrl'>;

export interface VotePosterProps {
  readonly design: PosterSource | null;
  /** Set when the design needed for the picture failed to load. */
  readonly failure?: { readonly onRetry: () => void } | undefined;
  /** A solid colour shown in the picture's box until the image paints. Defaults to the sky. */
  readonly placeholder?: string | undefined;
  /** Runs once the picture has loaded. */
  readonly onLoad?: (() => void) | undefined;
}

/**
 * The picture a voter sees first. It is a plain image with a fixed size, so it paints early and
 * the layout does not move; the 3D view loads only when the voter asks for it.
 */
export function VotePoster({ design, failure, placeholder, onLoad }: VotePosterProps) {
  const text = messages.vote;
  if (design === null && failure !== undefined) {
    return (
      <div className="web-vote__poster-note">
        <InlineAlert
          tone="danger"
          title={text.failed}
          action={{ label: text.retry, onPress: failure.onRetry }}
        />
      </div>
    );
  }
  if (design === null) {
    return (
      <Skeleton label={text.loadingDesign} className="web-vote__poster-wait" announce="quiet">
        <SkeletonBlock shape="poster" />
      </Skeleton>
    );
  }
  if (design.thumbnailUrl === null) {
    return <p className="web-vote__poster-note">{text.noPoster}</p>;
  }
  // Keyed by the picture, so the next design gets a new image. A reused one keeps drawing the
  // last design's picture under the new name until the new file arrives.
  return (
    <img
      key={design.thumbnailUrl}
      className="web-vote__poster"
      src={design.thumbnailUrl}
      alt={format(text.posterAlt, { title: design.title })}
      width={THUMBNAIL_WIDTH_PX}
      height={THUMBNAIL_HEIGHT_PX}
      {...HIGH_PRIORITY}
      style={{ backgroundColor: placeholder ?? sceneSky() }}
      onLoad={onLoad}
    />
  );
}
