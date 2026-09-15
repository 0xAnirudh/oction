import { config } from '../config.js';
import { getRedis } from '../redis/client.js';
import { keys } from '../redis/keys.js';
import { log } from '../log.js';

// Replay protection for requests that must not happen twice.
//
// The Lua script in redis/lua/bid.lua makes a bid atomic - it cannot be
// half-applied, and two bidders cannot both win a rung. It does not make
// a bid *unrepeatable*: the same person sending the same bid twice is
// two intents as far as the script is concerned, and it will walk the
// price up for both. That is what this closes.

const MAX_KEY_LENGTH = 200;

export function isValidKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

export async function begin(userId, key) {
  const reply = await getRedis().ocIdempotency(
    keys.idempotency(userId, key),
    String(config.idempotencyTtlMs),
  );
  const state = String(reply[0]);
  if (state !== 'done') return { state };

  try {
    return { state, replay: JSON.parse(String(reply[1])) };
  } catch {
    // A stored reply we cannot read is worse than none - let it through
    // rather than answering with nonsense.
    return { state: 'new' };
  }
}

export async function finish(userId, key, status, body) {
  await getRedis()
    .set(
      keys.idempotency(userId, key),
      JSON.stringify({ status, body }),
      'PX',
      config.idempotencyTtlMs,
    )
    .catch((err) => log.warn('idempotency store failed', { err: err.message }));
}

// Something went wrong that is not the request's fault. Drop the claim
// so a retry is allowed to try again rather than being told it is still
// in flight for the next ten minutes.
export async function release(userId, key) {
  await getRedis().del(keys.idempotency(userId, key)).catch(() => {});
}
