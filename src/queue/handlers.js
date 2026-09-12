import { AuctionItem } from '../db/models/AuctionItem.js';
import { ITEM_STATUS } from '../core/status.js';
import { activateDueItems } from '../services/catalog.js';
import { closeAuction, expireCheckout } from '../services/settlement.js';
import { JOBS, scheduleAuctionClose, scheduleCheckoutExpiry } from './index.js';
import { log } from '../log.js';

async function handleClose({ itemId }) {
  const result = await closeAuction(itemId);
  if (!result.done && result.endsAt) {
    // A late bid moved the finish line. Come back at the new one.
    await scheduleAuctionClose(itemId, result.endsAt);
    return { rescheduled: result.endsAt };
  }
  return result;
}

async function handleCheckoutExpiry({ orderId }) {
  const result = await expireCheckout(orderId);
  if (result.code === 'not_yet' && result.expiresAt) {
    await scheduleCheckoutExpiry(orderId, result.expiresAt);
    return { rescheduled: result.expiresAt };
  }
  return result;
}

// The safety net. Delayed jobs are the fast path; this is what notices
// when one was lost - a worker killed mid-flight, a Redis that came back
// without its delayed set. It is idempotent by construction, because
// everything it calls refuses to act twice.
async function handleSweep() {
  const activated = await activateDueItems();
  for (const item of activated) {
    await scheduleAuctionClose(item._id.toString(), new Date(item.endTime).getTime());
  }

  const overdue = await AuctionItem.find({
    status: ITEM_STATUS.ACTIVE,
    endTime: { $lte: new Date() },
  })
    .limit(100)
    .select('_id endTime');

  for (const item of overdue) {
    await scheduleAuctionClose(item._id.toString(), Date.now());
  }

  if (activated.length || overdue.length) {
    log.info('sweep', { activated: activated.length, overdue: overdue.length });
  }
  return { activated: activated.length, overdue: overdue.length };
}

export async function handleJob(job) {
  switch (job.name) {
    case JOBS.CLOSE:
      return handleClose(job.data);
    case JOBS.CHECKOUT_EXPIRY:
      return handleCheckoutExpiry(job.data);
    case JOBS.ACTIVATE:
      return handleSweep();
    default:
      log.warn('unknown job', { name: job.name });
      return null;
  }
}
