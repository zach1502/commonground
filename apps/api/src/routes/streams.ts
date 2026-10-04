/** Sends the chunks as they are written, so a large export never sits in memory whole. */
export function streamOf(chunks: Iterable<string>): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.iterator]();
  const encoder = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      const next = iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
  });
}
