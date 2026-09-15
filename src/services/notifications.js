import { User } from '../db/models/User.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { Order } from '../db/models/Order.js';
import { Watch } from '../db/models/Watch.js';
import { send } from '../mail/mailer.js';
import * as templates from '../mail/templates.js';
import { log } from '../log.js';

// Notices go out on the queue, never on the request.
//
// A bid is answered in single-digit milliseconds. Waiting on an SMTP
// round trip to tell the previous leader they were outbid would put a
// third party's mail server in the middle of an auction, and a slow one
// would show up as a slow bid. So the bid path enqueues and returns.

export const NOTICES = {
  OUTBID: 'outbid',
  WON: 'won',
  ROLLED_DOWN: 'rolled_down',
  CLOSING_SOON: 'closing_soon',
};

// Every notice checks the account's own switch before sending.
function wants(user, key) {
  if (!user) return false;
  return user.notify?.[key] ?? true;
}

async function notifyOutbid({ userId, itemId, amountCents }) {
  const [user, item] = await Promise.all([User.findById(userId), AuctionItem.findById(itemId)]);
  if (!item || !wants(user, 'outbid')) return { skipped: true };

  // The lead may have come back to them while this sat in the queue.
  if (item.currentWinner?.toString() === userId) return { skipped: 'leads_again' };

  await send(templates.outbid(user, item, amountCents));
  return { sent: true };
}

async function notifyWon({ orderId }) {
  const order = await Order.findById(orderId);
  if (!order) return { skipped: true };
  const [user, item] = await Promise.all([
    User.findById(order.buyerId),
    AuctionItem.findById(order.itemId),
  ]);
  if (!item || !wants(user, 'won')) return { skipped: true };

  const template = order.offerRank > 1 ? templates.rolledDown : templates.wonLot;
  await send(template(user, item, order));
  return { sent: true };
}

// The watchlist notice. Fired from a delayed job that was scheduled
// against the item's original close, so the first thing it does is ask
// whether that close is still the close - a late bid may have pushed it
// out, and a "closes soon" about something twenty minutes away is
// noise.
async function notifyClosingSoon({ itemId, leadMs }) {
  const item = await AuctionItem.findById(itemId);
  if (!item || item.status !== 'ACTIVE') return { skipped: true };

  const remaining = new Date(item.endTime).getTime() - Date.now();
  if (remaining > leadMs * 1.5) {
    return { reschedule: new Date(item.endTime).getTime() - leadMs };
  }

  const watches = await Watch.find({ itemId: item._id }).limit(500).lean();
  if (watches.length === 0) return { skipped: 'nobody_watching' };

  const users = await User.find({
    _id: { $in: watches.map((w) => w.userId) },
    // Only confirmed addresses for this one. It is the least
    // transactional notice here, and unconfirmed addresses are where
    // spam complaints come from.
    emailVerified: true,
  });

  let sent = 0;
  for (const user of users) {
    if (!wants(user, 'closingSoon')) continue;
    // Not to the person already winning it.
    if (item.currentWinner?.toString() === user._id.toString()) continue;
    await send(templates.closingSoon(user, item, item.endTime));
    sent += 1;
  }

  log.info('closing soon notices', { itemId: itemId.toString(), sent });
  return { sent };
}

const HANDLERS = {
  [NOTICES.OUTBID]: notifyOutbid,
  [NOTICES.WON]: notifyWon,
  [NOTICES.ROLLED_DOWN]: notifyWon,
  [NOTICES.CLOSING_SOON]: notifyClosingSoon,
};

export async function deliver({ kind, ...payload }) {
  const handler = HANDLERS[kind];
  if (!handler) {
    log.warn('unknown notice', { kind });
    return null;
  }
  return handler(payload);
}
