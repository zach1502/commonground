import type { ContextFeatureKind } from './context/context-feature.js';

/** Side length of one terrain grid cell, in metres. */
export const GRID_RESOLUTION_M = 1;

/** Beta prior added to vote counts before ranking submissions. */
export const DEFAULT_SCORE_PRIOR = { up: 2, down: 2 } as const;

/** Share of each review batch drawn from under-voted submissions. */
export const QUEUE_UNDER_VOTED_SHARE = 0.7;

/** Number of submissions served per review batch. */
export const QUEUE_BATCH_SIZE = 5;

/** Protected root zone radius in metres per centimetre of trunk diameter at breast height. */
export const ROOT_ZONE_RADIUS_PER_DBH_CM = 0.12;

/** Capacity of one dump truck load, in cubic metres. */
export const TRUCK_VOLUME_M3 = 10;

/** Maximum submissions one participant may have live at a time. */
export const MAX_LIVE_SUBMISSIONS = 3;

/** Default maximum running slope for accessible paths (rise over run). */
export const DEFAULT_MAX_RUNNING_SLOPE = 0.05;

/** Default maximum cross slope for accessible paths (rise over run). */
export const DEFAULT_MAX_CROSS_SLOPE = 0.02;

/** Default maximum cut or fill depth per cell, in metres. */
export const DEFAULT_TERRAFORM_LIMIT_M = 5;

/** Multiplier from a 0 to 1 share to a percent. */
export const PERCENT_SCALE = 100;

/** Distance between slope samples along a path, in metres. */
export const SLOPE_SAMPLE_STEP_M = 1;

/** Slope error allowed before a check fails, so float32 terrain on an exact limit passes. */
export const SLOPE_TOLERANCE = 1e-4;

/** Width of one earthworks histogram bin on the insights page, in cubic metres. */
export const EARTHWORKS_BIN_M3 = 50;

/** Earthworks bin widths to try, widest first, so a narrow spread still gets 5 bins. */
export const EARTHWORKS_BIN_STEPS_M3 = {
  widest: EARTHWORKS_BIN_M3,
  half: 25,
  fifth: 10,
  tenth: 5,
  fine: 2,
  finest: 1,
} as const;

/** Self-report groups with fewer people than this are hidden on the insights page. */
export const ENGAGEMENT_SUPPRESS_BELOW = 5;

/** A baseline feature counts as moved when its centre shifts further than this, in metres. */
export const BASELINE_MOVED_M = 1;

/** A baseline feature counts as resized when its area changes by more than this share. */
export const BASELINE_RESIZED_SHARE = 0.1;

/** Designs in an insights export when the request does not say. */
export const INSIGHTS_EXPORT_TOP_N = 10;

/** How long the server reuses a project's computed insights, in milliseconds. */
export const INSIGHTS_CACHE_MS = 5000;

/** Width of a stored design thumbnail, in CSS pixels. */
export const THUMBNAIL_WIDTH_PX = 640;

/** Height of a stored design thumbnail, in CSS pixels. */
export const THUMBNAIL_HEIGHT_PX = 400;

/** Solid colour shown before a thumbnail loads: the scene's sky, which fills the image's top. */
export const THUMBNAIL_PLACEHOLDER_COLOUR = '#cfe3f0';

/** The most characters a voter's comment on a design can hold, after trimming. */
export const VOTE_COMMENT_MAX_CHARS = 500;

/** The most characters a resident's comment on one design element can hold, after trimming. */
export const ELEMENT_COMMENT_MAX_CHARS = 280;

/** The most characters a planner's reply to an element comment can hold, after trimming. */
export const PLANNER_REPLY_MAX_CHARS = 500;

/** How long after writing a comment its author may still edit it: 15 minutes, in milliseconds. */
export const COMMENT_EDIT_WINDOW_MS = 900_000;

/** Comment count chips farther than this from the camera are hidden, in metres. */
export const COMMENT_CHIP_MAX_DISTANCE_M = 60;

/** How far around the parcel box the site context reaches, in metres. */
export const CONTEXT_BUFFER_M = 300;

/** Drawn width of a sidewalk ribbon, in metres. */
export const CONTEXT_SIDEWALK_WIDTH_M = 1.8;

/** Drawn width of a bikeway ribbon, in metres. */
export const CONTEXT_BIKEWAY_WIDTH_M = 1.5;

/**
 * Street width rule, in metres: the nearest right-of-way width within `searchM`, less `verge`
 * for sidewalks and boulevards, kept between `min` and `max`. With no width value it is `fallback`.
 */
export const CONTEXT_STREET_WIDTH_M = {
  fallback: 8,
  min: 6,
  max: 12,
  verge: 8,
  searchM: 15,
} as const;

/** Which context layers show before a person changes them: streets, sidewalks and bus stops. */
export const CONTEXT_LAYER_DEFAULTS = {
  street: 'on',
  sidewalk: 'on',
  busStop: 'on',
  parking: 'off',
  bikeway: 'off',
} as const satisfies Readonly<Record<ContextFeatureKind, 'on' | 'off'>>;
