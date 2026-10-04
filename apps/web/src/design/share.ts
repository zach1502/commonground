export type ShareResult = 'shared' | 'copied';

interface Sharer {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/** Opens the device share sheet when there is one, otherwise copies the link to the clipboard. */
export async function shareLink(url: string, title: string, text: string): Promise<ShareResult> {
  const sharer = navigator as unknown as Sharer;
  if (typeof sharer.share === 'function') {
    await sharer.share({ title, text, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
