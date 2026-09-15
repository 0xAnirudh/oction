import crypto from 'node:crypto';
import { getRedis } from '../redis/client.js';
import { parseRateReply } from '../redis/scripts.js';
import { log } from '../log.js';

// One sliding window, several buckets, one round trip.
//
// Every bucket is checked in a pipeline and the first refusal wins. A
// bucket whose limit is zero or missing is skipped, so a caller can pass
// only the dimensions it cares about.
export async function consume(buckets, { charge = true } = {}) {
  const live = buckets.filter((b) => b && b.key && b.max > 0);
  if (live.length === 0) return { allowed: true, retryAfterMs: 0, bucket: null };

  const now = Date.now();
  const member = `${now}:${crypto.randomUUID()}`;
  const pipeline = getRedis().pipeline();
  for (const bucket of live) {
    pipeline.ocRateLimit(
      bucket.key,
      String(now),
      String(bucket.windowMs),
      String(bucket.max),
      member,
      charge ? '1' : '0',
    );
  }

  let replies;
  try {
    replies = await pipeline.exec();
  } catch (err) {
    // A limiter that is down must not take the thing it protects down
    // with it.
    log.warn('rate limiter unavailable', { err: err.message });
    return { allowed: true, retryAfterMs: 0, bucket: null };
  }

  for (const [index, [err, reply]] of replies.entries()) {
    if (err) {
      log.warn('rate limit bucket failed', { err: err.message });
      continue;
    }
    const parsed = parseRateReply(reply);
    if (!parsed.allowed) {
      return { allowed: false, retryAfterMs: parsed.retryAfterMs, bucket: live[index].name ?? null };
    }
  }

  return { allowed: true, retryAfterMs: 0, bucket: null };
}

// Read the buckets without spending anything from them.
export const peek = (buckets) => consume(buckets, { charge: false });

// Charge a bucket without asking first. Used where the thing being
// counted is a failure rather than an attempt.
export async function record(key, windowMs) {
  const now = Date.now();
  await getRedis()
    .ocRateLimit(
      key,
      String(now),
      String(windowMs),
      String(Number.MAX_SAFE_INTEGER),
      `${now}:${crypto.randomUUID()}`,
      '1',
    )
    .catch(() => {});
}
