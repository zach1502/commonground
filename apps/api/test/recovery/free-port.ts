import { createServer } from 'node:net';

/**
 * A TCP port the OS reports free right now: on the loopback address by default, or on every
 * interface for a server that listens on all of them.
 */
export function freePort(scope: 'loopback' | 'any' = 'loopback'): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    const onListening = () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    };
    if (scope === 'loopback') probe.listen(0, '127.0.0.1', onListening);
    else probe.listen(0, onListening);
  });
}
