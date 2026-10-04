import { BlockList, isIPv4, isIPv6 } from 'node:net';

import type { Context } from 'hono';

import type { AppEnv } from '../deps.js';

// Used when neither the connection nor a trusted proxy names the caller, such as in tests or on
// Vercel without TRUST_PROXY. Every such caller then shares one bucket, which fails safe.
const UNKNOWN_ADDRESS = 'unknown';
// Loopback, private, shared and link-local ranges: where the proxies in front of the API live.
const INTERNAL_RANGES = [
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
] as const;

type Family = 'ipv4' | 'ipv6';

function familyOf(address: string): Family | undefined {
  if (isIPv4(address)) return 'ipv4';
  return isIPv6(address) ? 'ipv6' : undefined;
}

const INTERNAL = new BlockList();
INTERNAL_RANGES.forEach((range) => {
  const [network = '', prefix = ''] = range.split('/');
  const family = familyOf(network);
  if (family !== undefined) INTERNAL.addSubnet(network, Number(prefix), family);
});

function isInternal(address: string): boolean {
  const family = familyOf(address);
  return family !== undefined && INTERNAL.check(address, family);
}

/** The peer's address on the Node entry, which passes the incoming request as the env. */
function connectionAddress(c: Context<AppEnv>): string | undefined {
  const env: unknown = c.env;
  if (typeof env !== 'object' || env === null || !('incoming' in env)) return undefined;
  const socket = (env.incoming as { socket?: { remoteAddress?: unknown } } | undefined)?.socket;
  const address = socket?.remoteAddress;
  return typeof address === 'string' && address !== '' ? address : undefined;
}

/**
 * Walks the chain from the nearest hop outward and returns the first address that is not one of
 * the proxies: the right-most hop outside the internal ranges. Hops left of it are whatever the
 * caller wrote, so they never pick the bucket.
 */
function firstUntrustedHop(forwardedFor: string | undefined): string | undefined {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');
  const nearestFirst = [...hops].reverse();
  // When every hop is internal the caller is inside the network too, and the farthest hop is
  // the best name for it, even though that name is an internal address.
  return nearestFirst.find((hop) => !isInternal(hop)) ?? hops[0];
}

export interface ClientAddressOptions {
  /** TRUST_PROXY: a proxy that sets X-Forwarded-For stands in front of the API. */
  readonly trustProxy: boolean;
}

/**
 * The caller's address for per-address limits such as sign-in. Without a trusted proxy only the
 * connection counts, so X-Forwarded-For and X-Real-IP cannot open new buckets.
 */
export function clientAddress(c: Context<AppEnv>, options: ClientAddressOptions): string {
  const connection = connectionAddress(c);
  if (!options.trustProxy) return connection ?? UNKNOWN_ADDRESS;
  return firstUntrustedHop(c.req.header('X-Forwarded-For')) ?? connection ?? UNKNOWN_ADDRESS;
}
