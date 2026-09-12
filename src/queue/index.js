import { Queue } from 'bullmq';
import { createRedis } from '../redis/client.js';
import { log } from '../log.js';

export const QUEUE_NAME = 'oction';

export const JOBS = {
  CLOSE: 'auction-close',
  CHECKOUT_EXPIRY: 'checkout-expiry',
  ACTIVATE: 'activate-due',
};

let queue;
let connection;

export function getQueue() {
  if (!queue) {
    connection = createRedis('queue');
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

// The delayed job is a prompt, not an authority.
//
// The spec's Phase 3 extends the auction by pushing the expiry job out
// by +30 seconds. That works until two bids land in the same window, at
// which point the pushes stack and the auction closes later than the
// clock everyone is watching. So the end time lives in Redis, this job
// only asks whether the time has come, and close.lua answers - closed,
// already closed, or still open and here is the new time to come back
// at. The worker then reschedules itself. Extensions touch no queue
// state at all, which means a lost or duplicated job cannot desynchronise
// the close from the countdown.
export async function scheduleAuctionClose(itemId, endsAtMs) {
  const q = getQueue();
  // Hyphens, not colons. BullMQ rejects a custom id containing ':'
  // unless it happens to split into exactly three parts - a
  // compatibility carve-out for old repeatable jobs that its own TODO
  // says is going away. Relying on a three-segment id would break on a
  // version bump, so nothing here uses a colon at all.
  const jobId = `close-${itemId}-${endsAtMs}`;
  const delay = Math.max(0, endsAtMs - Date.now());
  await q.add(
    JOBS.CLOSE,
    { itemId, expectedEndsAt: endsAtMs },
    {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
  log.debug('close scheduled', { itemId, delay });
}

export async function scheduleCheckoutExpiry(orderId, expiresAtMs) {
  const q = getQueue();
  await q.add(
    JOBS.CHECKOUT_EXPIRY,
    { orderId },
    {
      jobId: `checkout-${orderId}`,
      delay: Math.max(0, expiresAtMs - Date.now()),
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

// One repeating sweep catches anything the delayed jobs missed - an item
// whose start time passed while the process was down, a close whose job
// was dropped. Cheap, and it means a lost job is a late auction rather
// than a stuck one.
export async function scheduleSweep() {
  const q = getQueue();
  await q.add(
    JOBS.ACTIVATE,
    {},
    {
      repeat: { every: 5_000 },
      removeOnComplete: true,
      removeOnFail: 20,
    },
  );
}

export async function closeQueue() {
  if (queue) await queue.close();
  if (connection) await connection.quit().catch(() => connection.disconnect());
  queue = undefined;
  connection = undefined;
}
