// Software WebGL is CPU-bound, so a busy machine can push one draw past the scene's render
// timeout. One more try covers a short spike; after that the design gets the plan poster.
const SCENE_ATTEMPTS = 2;

export interface JobRenderers<J> {
  readonly scene: (job: J) => Promise<Uint8Array>;
  readonly poster: (job: J) => Promise<Uint8Array>;
}

export interface RetryLog {
  info(message: string): void;
}

/** Draws one design in 3D, so one late frame does not stop the whole seed. */
export async function renderSceneOrPoster<J>(
  job: J,
  renderers: JobRenderers<J>,
  log: RetryLog,
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= SCENE_ATTEMPTS; attempt += 1) {
    try {
      return await renderers.scene(job);
    } catch (error) {
      log.info(
        `3D thumbnail try ${String(attempt)} of ${String(SCENE_ATTEMPTS)} failed: ${String(error)}`,
      );
    }
  }
  return renderers.poster(job);
}
