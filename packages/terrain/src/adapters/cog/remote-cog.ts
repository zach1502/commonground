import { BaseClient, BaseResponse, fromCustomClient, type GeoTIFFImage } from 'geotiff';

import { err, ok, type Result } from '@parkshape/core';

import type { HttpError, HttpFetch } from '../../ports/http.js';
import type { Raster } from '../../terrain-grid.js';

class InjectedResponse extends BaseResponse {
  constructor(
    private readonly response: Response,
    private readonly data: ArrayBuffer,
  ) {
    super();
  }

  override get status(): number {
    return this.response.status;
  }

  override getHeader(name: string): string | undefined {
    return this.response.headers.get(name) ?? undefined;
  }

  override getData(): Promise<ArrayBuffer> {
    return Promise.resolve(this.data);
  }
}

/** Lets geotiff.js make its HTTP range requests through the injected fetch. */
class InjectedFetchClient extends BaseClient {
  constructor(
    url: string,
    private readonly fetch: HttpFetch,
  ) {
    super(url);
  }

  override async request(options: RequestInit = {}): Promise<BaseResponse> {
    const init: RequestInit = options.headers === undefined ? {} : { headers: options.headers };
    const response = await this.fetch(this.url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)} for ${this.url}`);
    }
    return new InjectedResponse(response, await response.arrayBuffer());
  }
}

/** A rectangle in the raster's CRS units. */
export interface CrsBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Pixels read from part of a COG, with the CRS position of the window's top-left corner. */
export interface CogWindow extends Raster {
  readonly left: number;
  readonly top: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface OpenCog {
  /** ProjectedCSTypeGeoKey from the file, when it has one. */
  readonly epsg: number | undefined;
  /** Width of one pixel in CRS units. */
  readonly pixelSize: number;
  readWindow(bounds: CrsBounds): Promise<CogWindow>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function pixelWindow(image: GeoTIFFImage, bounds: CrsBounds): [number, number, number, number] {
  const [originX = 0, originY = 0] = image.getOrigin();
  const [resX = 1, resY = -1] = image.getResolution();
  const clampCol = (value: number) => Math.min(Math.max(value, 0), image.getWidth());
  const clampRow = (value: number) => Math.min(Math.max(value, 0), image.getHeight());
  const left = clampCol(Math.floor((bounds.minX - originX) / resX));
  const right = clampCol(Math.ceil((bounds.maxX - originX) / resX));
  const top = clampRow(Math.floor((originY - bounds.maxY) / Math.abs(resY)));
  const bottom = clampRow(Math.ceil((originY - bounds.minY) / Math.abs(resY)));
  return [left, top, Math.max(right, left + 1), Math.max(bottom, top + 1)];
}

async function readWindow(image: GeoTIFFImage, bounds: CrsBounds): Promise<CogWindow> {
  const window = pixelWindow(image, bounds);
  const [col0, row0, col1, row1] = window;
  const [originX = 0, originY = 0] = image.getOrigin();
  const [resX = 1, resY = -1] = image.getResolution();
  const raster = await image.readRasters({ window, samples: [0], interleave: true });
  const noData = image.getGDALNoData();
  return {
    width: col1 - col0,
    height: row1 - row0,
    values: raster,
    ...(noData === null ? {} : { noData }),
    left: originX + col0 * resX,
    top: originY - row0 * Math.abs(resY),
    pixelWidth: resX,
    pixelHeight: Math.abs(resY),
  };
}

/** Opens a remote COG by its header only; pixels are fetched later, window by window. */
export async function openCog(url: string, fetch: HttpFetch): Promise<Result<OpenCog, HttpError>> {
  try {
    const tiff = await fromCustomClient(new InjectedFetchClient(url, fetch), { maxRanges: 0 });
    const image = await tiff.getImage();
    const keys = image.getGeoKeys() as { ProjectedCSTypeGeoKey?: number } | null;
    return ok({
      epsg: keys?.ProjectedCSTypeGeoKey,
      pixelSize: Math.abs(image.getResolution()[0] ?? 1),
      readWindow: (bounds) => readWindow(image, bounds),
    });
  } catch (cause) {
    return err({ kind: 'network', url, message: messageOf(cause) });
  }
}
