import { config } from '../config.js';
import { getRedis } from '../redis/client.js';
import { keys } from '../redis/keys.js';
import { parseBidReply } from '../redis/scripts.js';
import { consume } from './rateLimit.js';
import { Bid } from '../db/models/Bid.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { ensureRoomState } from './catalog.js';
import { EVENTS } from '../realtime/events.js';
import { emitToRoom } from '../realtime/io.js';
import { enqueueNotice } from '../queue/index.js';
import { NOTICES } from './notifications.js';
import { log } from '../log.js';

export const REJECTION_TEXT = {
  not_found: 'That item is not open for bidding.',
  not_started: 'This auction has not started yet.',
  not_active: 'This auction is not running.',
  closed: 'This auction has closed.',
  seller: 'You cannot bid on your own item.',
  already_leading: 'You are already the highest bidder.',
  too_low: 'Someone has already bid at least that much.',
  above_cap: 'That bid is above the per-bid ceiling. Check the amount.',
  rate_limited: 'Slow down a moment.',
};

const HTTP_STATUS = {
  not_found: 404,
  rate_limited: 429,
  not_started: 409,
  not_active: 409,
  closed: 409,
  seller: 403,
  already_leading: 409,
  too_low: 409,
  above_cap: 422,
};

// Two windows, one round trip. The per-user limit is the real one; the
// per-IP limit is a backstop for a script cycling throwaway accounts.
function checkRate(userId, ip) {
  const { max, windowMs, ipMax } = config.rateLimit.bids;
  return consume([
    { name: 'user', key: keys.bidRateUser(userId), max, windowMs },
    { name: 'ip', key: keys.bidRateIp(ip || 'unknown'), max: ipMax, windowMs },
  ]);
}

export async function placeBid({ item, bidder, amountCents, ip }) {
  const itemId = item._id.toString();
  const bidderId = bidder._id.toString();

  const rate = await checkRate(bidderId, ip);
  if (!rate.allowed) {
    return {
      ok: false,
      code: 'rate_limited',
      status: HTTP_STATUS.rate_limited,
      message: REJECTION_TEXT.rate_limited,
      retryAfterMs: rate.retryAfterMs,
    };
  }

  await ensureRoomState(item);

  const now = Date.now();
  const reply = parseBidReply(
    await getRedis().ocBid(
      keys.itemState(itemId),
      bidderId,
      String(amountCents),
      String(now),
      String(config.softClose.windowMs),
      String(config.softClose.extendToMs),
      String(config.maxBidCents),
    ),
  );

  if (!reply.ok) {
    return {
      ok: false,
      code: reply.code,
      status: HTTP_STATUS[reply.code] ?? 409,
      message: REJECTION_TEXT[reply.code] ?? 'That bid was not accepted.',
      highBidCents: reply.highBidCents,
      nextMinimumCents: reply.nextMinimumCents,
      endTime: reply.endsAt ? new Date(reply.endsAt) : null,
    };
  }

  const placedAt = new Date(now);
  const endTime = new Date(reply.endsAt);

  // Redis decided; Mongo remembers. The unique index on (itemId, seq) is
  // what makes a retry after a timeout land once rather than twice.
  try {
    await Bid.create({
      itemId: item._id,
      bidderId: bidder._id,
      displayName: bidder.displayName,
      amountCents,
      seq: reply.seq,
      placedAt,
      extendedEndTimeTo: reply.extended ? endTime : null,
    });
  } catch (err) {
    if (err?.code !== 11000) {
      log.error('bid log write failed', {
        itemId,
        seq: reply.seq,
        err: err.message,
      });
    }
  }

  // The projection only ever moves forward. Two bids whose Mongo writes
  // arrive out of order must not walk the displayed price backwards, so
  // the guard is the sequence number rather than the clock.
  await AuctionItem.updateOne(
    { _id: item._id, bidCount: { $lt: reply.bidCount } },
    {
      $set: {
        currentHighestBidCents: reply.highBidCents,
        currentWinner: bidder._id,
        bidCount: reply.bidCount,
        endTime,
      },
      ...(reply.extended ? { $inc: { extensionCount: 1 } } : {}),
    },
  );

  const accepted = {
    itemId,
    bidId: reply.seq,
    seq: reply.seq,
    amountCents: reply.highBidCents,
    bidderId,
    displayName: bidder.displayName,
    bidCount: reply.bidCount,
    nextMinimumCents: reply.nextMinimumCents,
    endTime,
    placedAt,
  };

  emitToRoom(itemId, EVENTS.BID_ACCEPTED, accepted);

  // Whoever just lost the lead hears about it, on the queue. A bid is
  // answered in milliseconds and must not wait on a mail server.
  if (reply.previousWinnerId && reply.previousWinnerId !== bidderId) {
    enqueueNotice({
      kind: NOTICES.OUTBID,
      userId: reply.previousWinnerId,
      itemId,
      amountCents: reply.highBidCents,
    }).catch((err) => log.warn('outbid notice not queued', { itemId, err: err.message }));
  }
  if (reply.extended) {
    // The countdown everyone is watching moved. Telling the room is not
    // optional - a client still counting to the old number will show a
    // closed auction that is still taking bids.
    emitToRoom(itemId, EVENTS.TIMER_EXTENDED, {
      itemId,
      endTime,
      causedBySeq: reply.seq,
      windowMs: config.softClose.windowMs,
    });
  }

  return { ok: true, status: 201, ...accepted, extended: reply.extended };
}

// The ordered, distinct bidders under the winner - the roll-down list.
// One entry per person at the best price they offered, highest first.
export async function biddersByRank(itemId) {
  const bids = await Bid.find({ itemId }).sort({ amountCents: -1, seq: 1 }).lean();
  const seen = new Set();
  const ranked = [];
  for (const bid of bids) {
    const id = bid.bidderId.toString();
    if (seen.has(id)) continue;
    seen.add(id);
    ranked.push({
      bidderId: bid.bidderId,
      displayName: bid.displayName,
      amountCents: bid.amountCents,
    });
  }
  return ranked;
}
