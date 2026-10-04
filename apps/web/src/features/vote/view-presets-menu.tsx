import { useEffect, useId, useRef, useState, type RefObject } from 'react';

import { Button } from '@parkshape/ui';

import { messages } from '../../messages';

// Under this width the scene's three preset buttons cover the top of the park.
const NARROW_QUERY = '(max-width: 479px)';
const SCENE_PRESETS_SELECTOR = '[role="group"] button';

export type StageWidth = 'narrow' | 'wide';

function widthNow(): StageWidth {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
    ? 'narrow'
    : 'wide';
}

/** 'narrow' under 480 px, where the camera presets move out of the picture. */
export function useStageWidth(): StageWidth {
  const [width, setWidth] = useState<StageWidth>(widthNow);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => {
      setWidth(widthNow());
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);
  return width;
}

/**
 * Presses the 3D view's own preset button with this label. The scene keeps that button hidden
 * on a narrow stage, and it owns the camera, so the menu drives it instead of a second camera.
 */
function pressScenePreset(stage: HTMLElement | null, label: string): void {
  const buttons = stage?.querySelectorAll<HTMLButtonElement>(SCENE_PRESETS_SELECTOR) ?? [];
  Array.from(buttons)
    .find((button) => button.textContent === label)
    ?.click();
}

export interface ViewPresetsMenuProps {
  /** The stage that holds the 3D view and its hidden preset buttons. */
  readonly stage: RefObject<HTMLElement>;
}

/**
 * One View button under the stage that opens Reset view, Top-down and Bird's eye, for a narrow
 * stage. Choosing one or pressing Escape closes the menu and gives focus back to View.
 */
export function ViewPresetsMenu({ stage }: ViewPresetsMenuProps) {
  const labels = messages.editor.viewer;
  const menuId = useId();
  const [menu, setMenu] = useState<'open' | 'closed'>('closed');
  const trigger = useRef<HTMLDivElement>(null);
  const close = () => {
    setMenu('closed');
    trigger.current?.querySelector('button')?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={trigger}
      className="web-vote__view-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu === 'open') close();
      }}
    >
      <Button
        variant="secondary"
        size="small"
        aria-expanded={menu === 'open' ? 'true' : 'false'}
        aria-controls={menuId}
        onPress={() => {
          setMenu(menu === 'open' ? 'closed' : 'open');
        }}
      >
        {messages.vote.viewMenu}
      </Button>
      {menu === 'open' ? (
        <div id={menuId} role="group" aria-label={labels.viewControls} className="web-vote__views">
          {[labels.resetView, labels.topDown, labels.birdsEye].map((label) => (
            <Button
              key={label}
              variant="tertiary"
              size="small"
              onPress={() => {
                pressScenePreset(stage.current, label);
                close();
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
