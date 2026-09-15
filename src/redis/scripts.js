import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ioredis handles the EVALSHA dance for us: it loads each script once,
// calls it by hash after that, and replays the body if the server
// restarts and forgets it.

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(path.join(dir, 'lua', name), 'utf8');

const DEFINITIONS = [
  ['ocBid', 1, 'bid.lua'],
  ['ocEnsureState', 1, 'ensure_state.lua'],
  ['ocClose', 1, 'close.lua'],
  ['ocRateLimit', 1, 'rate_limit.lua'],
  ['ocIdempotency', 1, 'idempotency.lua'],
];

export function attachScripts(redis) {
  for (const [name, numberOfKeys, file] of DEFINITIONS) {
    if (typeof redis[name] === 'function') continue;
    redis.defineCommand(name, { numberOfKeys, lua: read(file) });
  }
  return redis;
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

export function parseBidReply(reply) {
  return {
    ok: num(reply[0]) === 1,
    code: String(reply[1]),
    highBidCents: num(reply[2]),
    winnerId: str(reply[3]),
    bidCount: num(reply[4]),
    seq: num(reply[5]),
    endsAt: num(reply[6]),
    extended: num(reply[7]) === 1,
    nextMinimumCents: num(reply[8]),
    previousWinnerId: str(reply[9]),
  };
}

const STATE_FIELDS = [
  'status',
  'sellerId',
  'startingPrice',
  'reservePrice',
  'increment',
  'highBid',
  'winnerId',
  'bidCount',
  'seq',
  'startsAt',
  'endsAt',
  'scheduledEndsAt',
  'extensions',
];

export function parseStateReply(reply) {
  const raw = Object.fromEntries(STATE_FIELDS.map((f, i) => [f, reply[i]]));
  return {
    status: String(raw.status),
    sellerId: str(raw.sellerId),
    startingPriceCents: num(raw.startingPrice),
    reservePriceCents: num(raw.reservePrice),
    incrementCents: num(raw.increment),
    highBidCents: num(raw.highBid),
    winnerId: str(raw.winnerId),
    bidCount: num(raw.bidCount),
    seq: num(raw.seq),
    startsAt: num(raw.startsAt),
    endsAt: num(raw.endsAt),
    scheduledEndsAt: num(raw.scheduledEndsAt),
    extensions: num(raw.extensions),
  };
}

export function parseCloseReply(reply) {
  return {
    closed: num(reply[0]) === 1,
    code: String(reply[1]),
    highBidCents: num(reply[2]),
    winnerId: str(reply[3]),
    bidCount: num(reply[4]),
    endsAt: num(reply[5]),
  };
}

export function parseRateReply(reply) {
  return {
    allowed: num(reply[0]) === 1,
    used: num(reply[1]),
    retryAfterMs: num(reply[2]),
  };
}
