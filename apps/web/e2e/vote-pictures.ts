import { expect, type Page } from '@playwright/test';

import { API_URL } from './urls.ts';

type Rgb = readonly [number, number, number];

export interface StoredPicture {
  readonly url: string;
  readonly colour: Rgb;
}

const HTTP_OK = 200;
const HALF = 2;
const PICTURE_WIDTH = 16;
const PICTURE_HEIGHT = 10;
// Every stored picture answers this late, as on a phone link, so a stale picture would show.
const PICTURE_DELAY_MS = 400;
// A fading layer blends with the stage, so a colour counts within this distance in RGB.
const SAME_COLOUR = 100;

// One solid colour per design, far from the sky behind the picture and from each other, so a
// screenshot tells which design's picture the stage is drawing.
const PICTURED = [
  { persona: 'persona-bob-walksadog', title: 'Shady lane walk', hex: '#c82828' },
  { persona: 'persona-kevin-kickabout', title: 'Garden by the fence', hex: '#1e8c32' },
  { persona: 'persona-sally-smoothpath', title: 'Swings and a picnic lawn', hex: '#2828b4' },
] as const;
const HEX_RADIX = 16;

function rgbOf(hex: string): Rgb {
  const [, r = '', g = '', b = ''] = /^#(..)(..)(..)$/.exec(hex) ?? [];
  return [
    Number.parseInt(r, HEX_RADIX),
    Number.parseInt(g, HEX_RADIX),
    Number.parseInt(b, HEX_RADIX),
  ];
}

/** A solid PNG drawn in the page, base64, the way the app's captured picture is sent. */
async function solidPicture(page: Page, hex: string): Promise<string> {
  return page.evaluate(
    ({ fill, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2D canvas');
      context.fillStyle = fill;
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    },
    { fill: hex, width: PICTURE_WIDTH, height: PICTURE_HEIGHT },
  );
}

/**
 * Seeds three designs, each with a stored picture of its own colour, and returns each title's
 * picture URL and colour. `seed` submits one design as the persona and returns its id.
 */
export async function seedPicturedDesigns(
  page: Page,
  projectId: string,
  seed: (persona: string, title: string) => Promise<string>,
): Promise<ReadonlyMap<string, StoredPicture>> {
  const pictures = new Map<string, StoredPicture>();
  for (const { persona, title, hex } of PICTURED) {
    const designId = await seed(persona, title);
    const stored = await page.request.post(`${API_URL}/designs/${designId}/thumbnail`, {
      data: { image: await solidPicture(page, hex) },
    });
    expect(stored.status(), `${title} in ${projectId}`).toBe(HTTP_OK);
    const { thumbnailUrl } = (await stored.json()) as { thumbnailUrl: string | null };
    if (thumbnailUrl === null) throw new Error(`no picture stored for ${title}`);
    pictures.set(title, { url: thumbnailUrl, colour: rgbOf(hex) });
  }
  expect(new Set([...pictures.values()].map(({ url }) => url)).size).toBe(PICTURED.length);
  return pictures;
}

/** Holds every stored picture for a moment before it answers. */
export async function delayPictures(page: Page): Promise<void> {
  await page.route('**/blobs/thumbnails/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, PICTURE_DELAY_MS));
    await route.continue();
  });
}

const stagePoster = (page: Page) => page.locator('.web-vote__stage > img.web-vote__poster');

/** The colour drawn at the centre of the card's picture, read from a screenshot. */
export async function posterColour(page: Page): Promise<Rgb> {
  const shot = await stagePoster(page).screenshot({ animations: 'allow' });
  return page.evaluate(
    async ({ base64, half }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2D canvas');
      context.drawImage(image, 0, 0);
      const [r = 0, g = 0, b = 0] = context.getImageData(
        Math.floor(image.width / half),
        Math.floor(image.height / half),
        1,
        1,
      ).data;
      return [r, g, b] as const;
    },
    { base64: shot.toString('base64'), half: HALF },
  );
}

/** Whether the stage is drawing a picture of this colour, allowing for a fade. */
export function shows(drawn: Rgb, colour: Rgb): boolean {
  return (
    Math.hypot(drawn[0] - colour[0], drawn[1] - colour[1], drawn[2] - colour[2]) <= SAME_COLOUR
  );
}

/**
 * The card's name and its picture, once that picture has loaded: the poster's src is the
 * design's stored URL and the stage draws that design's colour.
 */
export async function expectCaptionedPicture(
  page: Page,
  pictures: ReadonlyMap<string, StoredPicture>,
): Promise<StoredPicture & { readonly title: string }> {
  const title = (await page.locator('.web-vote__title').textContent()) ?? '';
  const picture = pictures.get(title);
  if (picture === undefined) throw new Error(`no seeded picture for ${title}`);
  await expect(stagePoster(page)).toHaveAttribute('src', picture.url);
  await expect
    .poll(async () => shows(await posterColour(page), picture.colour), { message: title })
    .toBe(true);
  return { title, ...picture };
}
