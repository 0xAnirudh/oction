import crypto from 'node:crypto';
import { config } from '../config.js';
import { getRedis } from '../redis/client.js';
import { keys } from '../redis/keys.js';
import { parseCloseReply } from '../redis/scripts.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { Order } from '../db/models/Order.js';
import { ITEM_STATUS, ORDER_STATUS, UNSOLD_REASON } from '../core/status.js';
import { ensureRoomState } from './catalog.js';
import { biddersByRank } from './bidding.js';
import { EVENTS } from '../realtime/events.js';
import { emitToRoom } from '../realtime/io.js';
import { enqueueNotice, scheduleCheckoutExpiry } from '../queue/index.js';
import { NOTICES } from './notifications.js';
import { log } from '../log.js';

// Bring an auction to a stop and decide what happens to the item.
//
// Returns `{ done: false, endsAt }` when the clock has moved under the
// job that called it - the caller reschedules and comes back. Anything
// else is final.
export async function closeAuction(itemId, { now = Date.now() } = {}) {
  const item = await AuctionItem.findById(itemId);
  if (!item) return { done: true, code: 'not_found' };
  if (item.status !== ITEM_STATUS.ACTIVE) return { done: true, code: 'not_active' };

  await ensureRoomState(item);
  const reply = parseCloseReply(await getRedis().ocClose(keys.itemState(itemId), String(now)));

  if (reply.code === 'still_open') {
    return { done: false, code: 'still_open', endsAt: reply.endsAt };
  }
  if (reply.code === 'not_active') {
    // Another worker got here first. The script is what arbitrates, so
    // losing this race means the close already happened - and carrying
    // on from here would cut a second order for the same item.
    return { done: true, code: 'already_closed' };
  }
  if (reply.code === 'not_found') {
    // The room evaporated - an eviction, or a Redis that came back empty.
    // Mongo still has the log, so close on what the projection knows
    // rather than leaving the item ACTIVE forever.
    log.warn('closing from mongo projection; room state missing', { itemId });
  }

  item.status = ITEM_STATUS.ENDED;
  if (reply.code === 'ok') {
    item.currentHighestBidCents = reply.highBidCents;
    item.currentWinner = reply.winnerId || null;
    item.bidCount = reply.bidCount;
    item.endTime = new Date(reply.endsAt);
  }
  await item.save();

  emitToRoom(itemId, EVENTS.AUCTION_ENDED, {
    itemId,
    finalBidCents: item.currentHighestBidCents,
    winnerId: item.currentWinner?.toString() ?? null,
    bidCount: item.bidCount,
    endedAt: new Date(now),
  });

  if (!item.currentWinner || item.currentHighestBidCents <= 0) {
    await markUnsold(item, UNSOLD_REASON.NO_BIDS);
    return { done: true, code: 'unsold', reason: UNSOLD_REASON.NO_BIDS };
  }
  if (item.reservePriceCents > 0 && item.currentHighestBidCents < item.reservePriceCents) {
    await markUnsold(item, UNSOLD_REASON.RESERVE_NOT_MET);
    return {
      done: true,
      code: 'unsold',
      reason: UNSOLD_REASON.RESERVE_NOT_MET,
    };
  }

  const offer = await offerToRank(item, 1);
  return {
    done: true,
    code: offer.ok ? 'offered' : 'unsold',
    orderId: offer.order?._id?.toString() ?? null,
  };
}

// Hand the item to the nth eligible bidder and start their clock.
async function offerToRank(item, rank) {
  const ranked = await biddersByRank(item._id);
  // Nobody is offered an item below the seller's floor, however far down
  // the list we have walked.
  const eligible = ranked.filter((b) => b.amountCents >= (item.reservePriceCents || 0));
  const candidate = eligible[rank - 1];

  if (!candidate) {
    await markUnsold(item, UNSOLD_REASON.NO_TAKERS);
    return { ok: false };
  }

  const reservedAt = new Date();
  const expiresAt = new Date(reservedAt.getTime() + config.checkoutTtlMs);

  let order;
  try {
    order = await Order.create({
      itemId: item._id,
      buyerId: candidate.bidderId,
      sellerId: item.sellerId,
      amountCents: candidate.amountCents,
      status: ORDER_STATUS.PENDING,
      offerRank: rank,
      reservedAt,
      expiresAt,
    });
  } catch (err) {
    // The partial unique index on (itemId, status: PENDING) is the last
    // line: one live claim per item, whatever raced to get here. If it
    // fires, somebody else has already offered this item and theirs
    // stands.
    if (err?.code === 11000) {
      log.warn('offer lost a race, existing claim stands', {
        itemId: item._id.toString(),
        rank,
      });
      const existing = await Order.findOne({
        itemId: item._id,
        status: ORDER_STATUS.PENDING,
      });
      return { ok: Boolean(existing), order: existing ?? undefined };
    }
    throw err;
  }

  item.settlement.orderId = order._id;
  item.settlement.rollDowns = rank - 1;
  await item.save();

  await scheduleCheckoutExpiry(order._id.toString(), expiresAt.getTime());
  await enqueueNotice({
    kind: rank === 1 ? NOTICES.WON : NOTICES.ROLLED_DOWN,
    orderId: order._id.toString(),
  }).catch((err) => log.warn('win notice not queued', { err: err.message }));

  const event = rank === 1 ? EVENTS.AUCTION_ENDED : EVENTS.CHECKOUT_ROLLED;
  emitToRoom(item._id.toString(), event, {
    itemId: item._id.toString(),
    orderId: order._id.toString(),
    buyerId: candidate.bidderId.toString(),
    displayName: candidate.displayName,
    amountCents: candidate.amountCents,
    offerRank: rank,
    expiresAt,
  });

  log.info('item offered', {
    itemId: item._id.toString(),
    rank,
    amountCents: candidate.amountCents,
  });
  return { ok: true, order };
}

async function markUnsold(item, reason) {
  item.status = ITEM_STATUS.UNSOLD;
  item.settlement.unsoldReason = reason;
  item.settlement.settledAt = new Date();
  await item.save();
  emitToRoom(item._id.toString(), EVENTS.ITEM_SETTLED, {
    itemId: item._id.toString(),
    status: ITEM_STATUS.UNSOLD,
    reason,
  });
  log.info('item unsold', { itemId: item._id.toString(), reason });
}

// The checkout clock ran out. The item does not go back on the shelf; it
// goes to the next person who wanted it at a price the seller accepts.
export async function expireCheckout(orderId, { now = Date.now() } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return { code: 'not_found' };
  if (order.status !== ORDER_STATUS.PENDING) return { code: 'already_resolved' };
  if (order.expiresAt.getTime() > now) {
    return { code: 'not_yet', expiresAt: order.expiresAt.getTime() };
  }

  order.status = ORDER_STATUS.EXPIRED;
  await order.save();

  const item = await AuctionItem.findById(order.itemId);
  if (!item) return { code: 'item_missing' };
  if (item.status !== ITEM_STATUS.ENDED) return { code: 'item_resolved' };

  log.info('checkout expired, rolling down', {
    orderId,
    rank: order.offerRank,
  });
  const next = await offerToRank(item, order.offerRank + 1);
  return {
    code: next.ok ? 'rolled' : 'unsold',
    orderId: next.order?._id?.toString() ?? null,
  };
}

// Simulated checkout. A payment processor slots in where paymentRef is
// filled: take the intent id from it and move the status on its webhook
// rather than here.
export async function payOrder({ order, user, shipping, now = Date.now() }) {
  if (order.buyerId.toString() !== user._id.toString()) return { error: 'not_yours', status: 403 };
  if (order.status !== ORDER_STATUS.PENDING) return { error: 'not_pending', status: 409 };
  if (order.expiresAt.getTime() <= now) return { error: 'expired', status: 410 };

  order.status = ORDER_STATUS.PAID;
  order.paidAt = new Date(now);
  order.shipping = shipping;
  order.paymentRef = `sim_${crypto.randomUUID()}`;
  await order.save();

  const item = await AuctionItem.findById(order.itemId);
  if (item) {
    item.status = ITEM_STATUS.SETTLED;
    item.settlement.orderId = order._id;
    item.settlement.soldForCents = order.amountCents;
    item.settlement.settledAt = order.paidAt;
    await item.save();

    emitToRoom(item._id.toString(), EVENTS.ITEM_SETTLED, {
      itemId: item._id.toString(),
      status: ITEM_STATUS.SETTLED,
      soldForCents: order.amountCents,
      buyerId: order.buyerId.toString(),
    });
  }

  // Next time, the address is already there.
  if (!user.defaultShipping?.line1) {
    user.defaultShipping = shipping;
    await user.save();
  }

  return { order };
}

// Pull a listing. Staff action, not a seller one - a seller who could
// withdraw their own lot mid-auction could use it to escape a price
// they did not like, which is the one thing a binding bid is for.
export async function withdrawItem(item, reason, staffId) {
  if ([ITEM_STATUS.SETTLED, ITEM_STATUS.UNSOLD].includes(item.status)) {
    return { error: 'already_resolved' };
  }

  // Stop the room taking bids first, then write the record. The other
  // order leaves a window where Mongo says withdrawn and Redis is still
  // accepting money.
  await ensureRoomState(item);
  await getRedis()
    .hset(keys.itemState(item._id.toString()), 'status', 'WITHDRAWN')
    .catch((err) => log.warn('room not stopped on withdrawal', { err: err.message }));

  item.status = ITEM_STATUS.UNSOLD;
  item.settlement.unsoldReason = UNSOLD_REASON.WITHDRAWN;
  item.settlement.settledAt = new Date();
  await item.save();

  // Any live claim on it dies with the listing.
  await Order.updateMany(
    { itemId: item._id, status: ORDER_STATUS.PENDING },
    { $set: { status: ORDER_STATUS.CANCELLED } },
  );

  emitToRoom(item._id.toString(), EVENTS.ITEM_SETTLED, {
    itemId: item._id.toString(),
    status: ITEM_STATUS.UNSOLD,
    reason: UNSOLD_REASON.WITHDRAWN,
  });

  log.warn('listing withdrawn', { itemId: item._id.toString(), staffId, reason });
  return { item };
}
