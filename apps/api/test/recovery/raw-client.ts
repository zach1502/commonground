import { connect, type Socket } from 'node:net';

/** A raw TCP client for probing the server with requests fetch cannot make. */
export interface RawClient {
  readonly socket: Socket;
  /** Everything the server has sent so far. */
  received(): string;
  /** Bytes this side handed to the socket before the server closed it. */
  written(): number;
  /** Resolves when the server closes the connection, with how long that took. */
  readonly closed: Promise<number>;
  write(chunk: string | Uint8Array): Promise<void>;
}

export function rawClient(port: number): Promise<RawClient> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let text = '';
    let bytes = 0;
    const started = performance.now();
    socket.setEncoding('latin1');
    socket.on('data', (chunk: string) => {
      text += chunk;
    });
    const closed = new Promise<number>((done) => {
      socket.on('close', () => {
        done(performance.now() - started);
      });
    });
    socket.on('error', () => undefined);
    const write = (chunk: string | Uint8Array) =>
      new Promise<void>((done) => {
        if (socket.destroyed) {
          done();
          return;
        }
        bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        socket.write(chunk, () => {
          done();
        });
      });
    socket.once('connect', () => {
      resolve({ socket, received: () => text, written: () => bytes, closed, write });
    });
    socket.once('error', reject);
  });
}

export function chunk(bytes: Uint8Array): Uint8Array {
  const head = Buffer.from(`${bytes.length.toString(16)}\r\n`, 'latin1');
  return Buffer.concat([head, bytes, Buffer.from('\r\n', 'latin1')]);
}
