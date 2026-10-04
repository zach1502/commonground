import { useEffect } from 'react';

import { messages } from '../messages';

export const OG_IMAGE_PATH = '/og/park.png';

export interface DocumentMeta {
  readonly title: string;
  readonly description: string;
  /** Absolute or root-relative Open Graph image; defaults to the shared park render. */
  readonly image?: string | null;
}

interface MetaKey {
  readonly attribute: 'name' | 'property';
  readonly key: string;
}

function setMeta({ attribute, key }: MetaKey, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (element === null) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.setAttribute('content', content);
}

/** Sets the page title, description and Open Graph tags for the current route. */
export function useDocumentMeta({ title, description, image }: DocumentMeta) {
  useEffect(() => {
    document.title = title;
    setMeta({ attribute: 'name', key: 'description' }, description);
    setMeta({ attribute: 'property', key: 'og:title' }, title);
    setMeta({ attribute: 'property', key: 'og:description' }, description);
    setMeta({ attribute: 'property', key: 'og:type' }, 'website');
    const source =
      image === undefined || image === null || image === ''
        ? `${window.location.origin}${OG_IMAGE_PATH}`
        : image;
    setMeta({ attribute: 'property', key: 'og:image' }, source);
    setMeta({ attribute: 'property', key: 'og:image:alt' }, messages.meta.ogImageAlt);
  }, [title, description, image]);
}
