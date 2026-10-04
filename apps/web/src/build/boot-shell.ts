import { SKELETON_DELAY_MS } from '@parkshape/ui';

const ROOT_ELEMENT = '<div id="root"></div>';
const PAGE_LINES = 3;

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => ESCAPES[character] ?? character);
}

const block = (shape: string) =>
  `<span class="ps-skeleton__block ps-skeleton__block--${shape}" aria-hidden="true"></span>`;

/**
 * Hides the blocks until 1 s after navigation started, the same wait the app's skeleton keeps,
 * so a fast load shows nothing new.
 */
const HOLD_SCRIPT = `<script>(function (shell, wait) {
  if (shell === null || wait <= 0) return;
  shell.hidden = true;
  setTimeout(function () { shell.hidden = false; }, wait);
})(document.currentScript.previousElementSibling, ${String(SKELETON_DELAY_MS)} - performance.now());</script>`;

/**
 * The generic page skeleton as static HTML, drawn before any script arrives. On a slow link the
 * entry takes seconds, and without this the page stays blank until then.
 */
export function bootShellMarkup(label: string): string {
  const title = `<div class="web-skeleton__title">${block('line')}${block('heading')}</div>`;
  const lines = Array.from({ length: PAGE_LINES }, () => block('line')).join('');
  return [
    '<div class="ps-skeleton web-page web-skeleton web-skeleton--page" role="status" aria-busy="true">',
    `<span class="ps-visually-hidden">${escapeHtml(label)}</span>`,
    title,
    lines,
    '</div>',
    HOLD_SCRIPT,
  ].join('');
}

/** Writes the shell into the empty root element of index.html; React replaces it on start. */
export function injectBootShell(html: string, markup: string): string {
  if (!html.includes(ROOT_ELEMENT)) {
    throw new Error(`index.html has no empty ${ROOT_ELEMENT} root element for the boot shell`);
  }
  return html.replace(ROOT_ELEMENT, `<div id="root">${markup}</div>`);
}
