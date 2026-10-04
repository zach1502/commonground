import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

import { Button } from './button.js';
import { enter, exit, MOTION_OFFSET_PX, type MotionOffset } from './motion/index.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  readonly title: string;
  readonly children: ReactNode;
  /**
   * The buttons in the dialog footer. The primary one is drawn first, on the left. Focus starts
   * on the first control that is not the primary or danger action. As a function it receives
   * `close`, which plays the exit and then calls `onClose`, for a Cancel button.
   */
  readonly actions: ReactNode | ((close: () => void) => ReactNode);
  /** Runs on Escape, after the exit. The caller unmounts the dialog to close it. */
  readonly onClose: () => void;
}

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Wraps Tab at either end of the panel so focus never leaves the dialog. */
function trapTab(event: KeyboardEvent<HTMLElement>, panel: HTMLElement): void {
  const items = focusables(panel);
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

const FILLED_VARIANTS: ReadonlySet<unknown> = new Set(['primary', 'danger']);

function isFilled(action: ReactNode): boolean {
  if (!isValidElement(action)) return false;
  const { variant } = action.props as { readonly variant?: unknown };
  return FILLED_VARIANTS.has(variant) || (action.type === Button && variant === undefined);
}

/** The caller's actions with the filled one moved to the front, keeping the rest in order. */
function primaryFirst(actions: ReactNode): ReactNode[] {
  const list =
    isValidElement(actions) && actions.type === Fragment
      ? Children.toArray(
          (actions as ReactElement<{ readonly children?: ReactNode }>).props.children,
        )
      : Children.toArray(actions);
  return [...list.filter(isFilled), ...list.filter((action) => !isFilled(action))];
}

/**
 * Focuses the first control that is not the filled action on open, since a submit or delete is
 * final, and gives focus back to the opener on close.
 */
function useFocusReturn(panel: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    if (node !== null) {
      const items = focusables(node);
      const safe = items.find((item) => !FILLED_VARIANTS.has(item.dataset.variant));
      (safe ?? items[0] ?? node).focus();
    }
    return () => {
      opener?.focus();
    };
  }, [panel]);
}

const RISE: MotionOffset = { axis: 'y', px: MOTION_OFFSET_PX.dialog };

/**
 * J3: the panel rises 8 px as it fades in over 250 ms, and leaves the same way over 150 ms. The
 * caller's `onClose` runs once the exit has finished, and only once.
 */
function useDialogMotion(panel: { readonly current: HTMLElement | null }, onClose: () => void) {
  const closing = useRef(false);
  useLayoutEffect(() => {
    if (panel.current !== null) void enter(panel.current, { offset: RISE });
  }, [panel]);
  return () => {
    if (closing.current) return;
    closing.current = true;
    const node = panel.current;
    void (node === null ? Promise.resolve() : exit(node, { offset: RISE })).then(onClose);
  };
}

/** A modal dialog over a backdrop. Focus stays inside it, and Escape closes it. */
export function Dialog({ title, children, actions, onClose }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useFocusReturn(panel);
  const close = useDialogMotion(panel, onClose);
  const footer = typeof actions === 'function' ? actions(close) : actions;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab' && panel.current !== null) {
      trapTab(event, panel.current);
    }
  };
  return (
    <div className="ps-dialog__backdrop">
      <div
        ref={panel}
        className="ps-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="ps-dialog__title">
          {title}
        </h2>
        <div className="ps-dialog__body">{children}</div>
        <div className="ps-dialog__actions">{primaryFirst(footer)}</div>
      </div>
    </div>
  );
}
