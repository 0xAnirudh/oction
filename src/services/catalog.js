import { AuctionItem } from '../db/models/AuctionItem.js';
import { ITEM_STATUS } from '../core/status.js';
import { getRedis } from '../redis/client.js';
import { keys } from '../redis/keys.js';
import { parseStateReply } from '../redis/scripts.js';
import { log } from '../log.js';

const DAY_MS = 86_400_000;

// Push an item's figures into Redis, or read back what is already there.
// Called when a room opens and again whenever the API needs live state:
// the script refuses to overwrite, so this is safe to call on every page
// view including one that lands mid-bid.
export async function ensureRoomState(item) {
  const redis = getRedis();
  const reply = await redis.ocEnsureState(
    keys.itemState(item._id.toString()),
    item.status,
    item.sellerId.toString(),
    String(item.startingPriceCents),
    String(item.reservePriceCents ?? 0),
    String(item.bidIncrementCents ?? 0),
    String(item.currentHighestBidCents ?? 0),
    item.currentWinner ? item.currentWinner.toString() : '',
    String(item.bidCount ?? 0),
    // seq and bidCount start level: the sequence advances once per
    // accepted bid, so a rebuilt room resumes numbering where the log ends.
    String(item.bidCount ?? 0),
    String(new Date(item.startTime).getTime()),
    String(new Date(item.endTime).getTime()),
    String(new Date(item.scheduledEndTime ?? item.endTime).getTime()),
    String(new Date(item.endTime).getTime() + DAY_MS),
  );
  return parseStateReply(reply);
}

// The media pipeline's warm end. An item's photo set does not change
// during its auction, so it is worth holding as one parsed blob rather
// than reaching back into Mongo for every arrival in the room.
export async function cacheItemMedia(item) {
  const redis = getRedis();
  const payload = JSON.stringify(item.images ?? []);
  await redis.set(keys.mediaCache(item._id.toString()), payload, 'PX', DAY_MS);
  return item.images ?? [];
}

export async function readCachedMedia(itemId) {
  const redis = getRedis();
  const raw = await redis.get(keys.mediaCache(itemId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Merge the durable record with whatever the live room says. Redis is
// ahead of Mongo during an auction - the projection is written behind
// the bid, so a page rendered from Mongo alone can show a stale price.
export async function itemWithLiveState(item) {
  const base = item.toPublic();
  if (item.status !== ITEM_STATUS.ACTIVE) return base;
  try {
    const state = await ensureRoomState(item);
    return {
      ...base,
      currentHighestBidCents: state.highBidCents,
      currentWinner: state.winnerId,
      bidCount: state.bidCount,
      endTime: new Date(state.endsAt),
      extensionCount: state.extensions,
      status: state.status,
      reserveMet: state.reservePriceCents === 0 || state.highBidCents >= state.reservePriceCents,
    };
  } catch (err) {
    // A room we cannot read is still an item we can show. The price may
    // be a few seconds stale; the alternative is a blank page.
    log.warn('live state unavailable', { itemId: base.id, err: err.message });
    return base;
  }
}

// Flip anything whose start time has arrived. Run by the scheduler, and
// harmless to run twice.
export async function activateDueItems(now = new Date()) {
  const due = await AuctionItem.find({
    status: ITEM_STATUS.UPCOMING,
    startTime: { $lte: now },
  }).limit(200);
  const activated = [];
  for (const item of due) {
    item.status = ITEM_STATUS.ACTIVE;
    await item.save();
    await ensureRoomState(item);
    await cacheItemMedia(item);
    activated.push(item);
  }
  return activated;
}

// Live figures for a page of items in one round trip. Browsing a
// catalogue of two dozen live auctions should not be two dozen
// conversations with Redis.
export async function liveStatesFor(items) {
  const live = items.filter((i) => i.status === ITEM_STATUS.ACTIVE);
  if (live.length === 0) return new Map();

  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const item of live) {
    pipeline.ocEnsureState(
      keys.itemState(item._id.toString()),
      item.status,
      item.sellerId.toString(),
      String(item.startingPriceCents),
      String(item.reservePriceCents ?? 0),
      String(item.bidIncrementCents ?? 0),
      String(item.currentHighestBidCents ?? 0),
      item.currentWinner ? item.currentWinner.toString() : '',
      String(item.bidCount ?? 0),
      String(item.bidCount ?? 0),
      String(new Date(item.startTime).getTime()),
      String(new Date(item.endTime).getTime()),
      String(new Date(item.scheduledEndTime ?? item.endTime).getTime()),
      String(new Date(item.endTime).getTime() + DAY_MS),
    );
  }

  const replies = await pipeline.exec();
  const states = new Map();
  replies.forEach(([err, reply], index) => {
    if (err) return;
    states.set(live[index]._id.toString(), parseStateReply(reply));
  });
  return states;
}

export function mergeLiveState(item, state) {
  const base = item.toPublic();
  if (!state) return base;
  return {
    ...base,
    currentHighestBidCents: state.highBidCents,
    currentWinner: state.winnerId,
    bidCount: state.bidCount,
    endTime: new Date(state.endsAt),
    extensionCount: state.extensions,
    status: state.status,
    reserveMet: state.reservePriceCents === 0 || state.highBidCents >= state.reservePriceCents,
  };
}
