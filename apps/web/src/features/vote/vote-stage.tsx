import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';
import { Button } from '@parkshape/ui';

import type { Design, Project } from '../../api/web-api';
import type { ContextApi } from '../../design/use-project-context';
import type { TerrainApi } from '../../design/use-project-terrain';
import { webGl2Support } from '../../design/webgl-support';
import { messages } from '../../messages';

import { swipeAction, type Point, type SwipeAction } from './swipe';
import { useStageWidth, ViewPresetsMenu, type StageWidth } from './view-presets-menu';
import { VotePoster, type PosterSource } from './vote-poster';
import type { VoteWalk } from './vote-viewer';
import { warmVoteModel } from './vote-warm';

// The 3D view and its text alternative load only after the poster paints, so they stay off the
// vote route's first-paint path.
const VoteModel = lazy(async () => ({ default: (await import('./vote-model')).VoteModel }));

type StageView = 'poster' | 'model';

// The picture's known size sets the stage shape in CSS, so the box never moves as it loads.
const STAGE_RATIO = {
  '--vote-stage-ratio': `${String(THUMBNAIL_WIDTH_PX)} / ${String(THUMBNAIL_HEIGHT_PX)}`,
};

function stageStyle(blockSize: number | null): CSSProperties {
  return (
    blockSize === null
      ? STAGE_RATIO
      : { ...STAGE_RATIO, '--vote-stage-block': `${String(blockSize)}px` }
  ) as CSSProperties;
}

interface ViewToggleProps {
  readonly view: StageView;
  readonly onChange: (next: StageView) => void;
  readonly children?: ReactNode;
  /** The View menu of camera presets on a narrow stage, at the row's end. */
  readonly presets?: ReactNode;
  /** Walk the park, after Compare with today; null without WebGL2. */
  readonly walk?: ReactNode;
}

/**
 * View in 3D, or Show picture once the 3D view is open, in the same slot under the stage. The
 * other controls that change the picture, Compare with today and Walk the park, sit beside it.
 */
function ViewToggle({ view, onChange, children, presets, walk }: ViewToggleProps) {
  const text = messages.vote;
  return (
    <div className="web-vote__open-model" data-walk={walk === null ? 'none' : 'offered'}>
      <Button
        variant="secondary"
        size="small"
        onPress={() => {
          onChange(view === 'model' ? 'poster' : 'model');
        }}
      >
        {view === 'model' ? text.showPicture : text.view3d}
      </Button>
      {children}
      {walk}
      {presets}
    </div>
  );
}

interface WalkButtonProps {
  readonly walking: boolean;
  readonly onPress: () => void;
  /** 'take' right after a walk ends, so focus comes back to the control that started it. */
  readonly focus: 'take' | 'leave';
}

/** Walk the park under the stage. Pressed while walking, it leaves the walk. */
function WalkButton({ walking, onPress, focus }: WalkButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus === 'take') ref.current?.querySelector('button')?.focus();
  }, [focus]);
  return (
    <div ref={ref} className="web-vote__walk">
      <Button
        variant="secondary"
        size="small"
        aria-pressed={walking ? 'true' : 'false'}
        held={walking ? 'held' : 'rest'}
        onPress={onPress}
      >
        {messages.walk.start}
      </Button>
    </div>
  );
}

export interface VoteStageProps {
  /** The summary shown as a picture: the candidate, or the site today when comparing. */
  readonly poster: PosterSource | null;
  readonly posterFailure?: { readonly onRetry: () => void } | undefined;
  /** The full design with its document, needed only once the 3D view is open. */
  readonly shown: Design | null;
  readonly project: Project;
  /** Reads the ground the 3D view draws. */
  readonly api: TerrainApi & ContextApi;
  readonly onSwipe: (action: SwipeAction) => void;
  /** Tells the batch the 3D view opened, so it loads the full design. */
  readonly onOpenModel?: () => void;
  /** A solid colour behind the picture until it loads. */
  readonly placeholder?: string | undefined;
  /** Runs once the picture has loaded. */
  readonly onPosterLoad?: () => void;
  /** Compare with today, shown beside View in 3D. */
  readonly compare?: ReactNode;
  /** On a phone, the height that makes the card fill the window; null keeps the picture shape. */
  readonly blockSize?: number | null;
  /** The design on the card; a new one ends any walk. */
  readonly designId?: string | undefined;
}

/**
 * The swipe surface for one design. It shows the picture first; three.js starts to download on
 * the first touch and mounts only after View in 3D. The vote buttons stay the primary path.
 */
export function VoteStage(props: VoteStageProps) {
  const { poster, posterFailure, shown, project, onSwipe } = props;
  const blockSize = props.blockSize ?? null;
  const [view, setView] = useState<StageView>('poster');
  const walk = useStageWalk(props.designId, props.onOpenModel);
  const presets = usePresetsGate(view);
  const { onDown, onUp } = useSwipe(onSwipe, walk.mode);
  // A walk shows the 3D view without changing the card's own view.
  const showing: StageView = walk.mode === 'walking' ? 'model' : view;
  const onView = (next: StageView) => {
    walk.end();
    setView(next);
    if (next === 'model') props.onOpenModel?.();
  };
  return (
    <>
      <div
        ref={presets.stage}
        className="web-vote__stage"
        data-testid="vote-stage"
        style={stageStyle(blockSize)}
        data-fit={blockSize === null ? 'picture' : 'window'}
        data-presets={presetsPlace(presets.width, walk.mode)}
        onPointerDownCapture={presets.onTouch}
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        {showing === 'model' ? (
          <Suspense fallback={<p className="web-vote__poster-note">{messages.vote.loading}</p>}>
            <VoteModel shown={shown} project={project} api={props.api} walk={walk.props} />
          </Suspense>
        ) : (
          <VotePoster
            design={poster}
            failure={posterFailure}
            placeholder={props.placeholder}
            onLoad={props.onPosterLoad}
          />
        )}
      </div>
      <ViewToggle
        view={showing}
        onChange={onView}
        presets={
          presets.shown && walk.mode === 'overview' ? (
            <ViewPresetsMenu stage={presets.stage} />
          ) : null
        }
        walk={walk.control}
      >
        {props.compare}
      </ViewToggle>
    </>
  );
}

/**
 * Where the camera presets go: in the View menu on a narrow stage, or in the scene's toolbar.
 * While walking the scene shows the walk's own buttons, which must stay visible.
 */
function presetsPlace(width: StageWidth, walk: 'walking' | 'overview') {
  if (walk === 'walking') return 'walk';
  return width === 'narrow' ? 'menu' : 'toolbar';
}

/** A drag on the stage as a vote. While walking, a drag looks around or walks, so it never votes. */
function useSwipe(onSwipe: (action: SwipeAction) => void, mode: 'walking' | 'overview') {
  const start = useRef<Point | null>(null);
  const onDown = (event: ReactPointerEvent) => {
    start.current = mode === 'walking' ? null : { x: event.clientX, y: event.clientY };
    warmVoteModel();
  };
  const onUp = (event: ReactPointerEvent) => {
    if (start.current === null) return;
    const action = swipeAction(start.current, { x: event.clientX, y: event.clientY });
    start.current = null;
    if (action !== null) onSwipe(action);
  };
  return { onDown, onUp };
}

/**
 * Walk the park from the card. The walk shows the card's design in the 3D view and leaves the
 * card's own view alone, so ending it brings back the picture or the 3D view it had before. A
 * new design on the card ends it, and without WebGL2 there is no button.
 */
function useStageWalk(designId: string | undefined, onOpenModel: (() => void) | undefined) {
  const [support] = useState(webGl2Support);
  const [walked, setWalked] = useState<{ readonly designId: string | undefined } | null>(null);
  const [focus, setFocus] = useState<'take' | 'leave'>('leave');
  const walking = walked !== null && walked.designId === designId;
  const props = useMemo<VoteWalk | undefined>(
    () =>
      walking
        ? {
            onLeave: () => {
              setWalked(null);
              setFocus('take');
            },
          }
        : undefined,
    [walking],
  );
  const onPress = () => {
    if (walking) {
      setWalked(null);
      return;
    }
    setFocus('leave');
    setWalked({ designId });
    onOpenModel?.();
  };
  const control =
    support === 'missing' ? null : (
      <WalkButton walking={walking} onPress={onPress} focus={walking ? 'leave' : focus} />
    );
  return {
    mode: walking ? ('walking' as const) : ('overview' as const),
    props,
    control,
    end: () => {
      setWalked(null);
    },
  };
}

/**
 * On a narrow stage the scene's preset buttons are hidden, and one View menu under the stage
 * takes their place once the voter has touched the open 3D view. Wider stages keep the scene's.
 */
function usePresetsGate(view: StageView) {
  const width = useStageWidth();
  const stage = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<'yes' | 'no'>('no');
  useEffect(() => {
    if (view === 'poster') setTouched('no');
  }, [view]);
  const onTouch = () => {
    if (view === 'model') setTouched('yes');
  };
  return {
    width,
    stage,
    onTouch,
    shown: width === 'narrow' && view === 'model' && touched === 'yes',
  };
}
