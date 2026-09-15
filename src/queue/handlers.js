import { AuctionItem } from '../db/models/AuctionItem.js';
import { ITEM_STATUS } from '../core/status.js';
import { activateDueItems } from '../services/catalog.js';
import { closeAuction, expireCheckout } from '../services/settlement.js';
import { deliver, NOTICES } from '../services/notifications.js';
import { config } from '../config.js';
import {
  JOBS,
  scheduleAuctionClose,
  scheduleCheckoutExpiry,
  scheduleClosingSoon,
} from './index.js';
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
    const endsAt = new Date(item.endTime).getTime();
    await scheduleAuctionClose(item._id.toString(), endsAt);
    const lead = config.notifications.closingSoonLeadMs;
    await scheduleClosingSoon(item._id.toString(), endsAt - lead, lead);
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

async function handleNotice(data) {
  return deliver(data);
}

// Same shape as the close: the delayed job asks whether the moment has
// arrived, and reschedules itself if a late bid moved it.
async function handleClosingSoon(data) {
  const result = await deliver({ kind: NOTICES.CLOSING_SOON, ...data });
  if (result?.reschedule) {
    await scheduleClosingSoon(data.itemId, result.reschedule, data.leadMs);
    return { rescheduled: result.reschedule };
  }
  return result;
}

export async function handleJob(job) {
  switch (job.name) {
    case JOBS.CLOSE:
      return handleClose(job.data);
    case JOBS.NOTIFY:
      return handleNotice(job.data);
    case JOBS.CLOSING_SOON:
      return handleClosingSoon(job.data);
    case JOBS.CHECKOUT_EXPIRY:
      return handleCheckoutExpiry(job.data);
    case JOBS.ACTIVATE:
      return handleSweep();
    default:
      log.warn('unknown job', { name: job.name });
      return null;
  }
}
