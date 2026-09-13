import { Router } from 'express';
import mongoose from 'mongoose';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { Bid } from '../../db/models/Bid.js';
import { ITEM_STATUS } from '../../core/status.js';
import { minimumBid } from '../../core/increments.js';
import { config } from '../../config.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireSeller } from '../middleware/authenticate.js';
import { uploadImages } from '../middleware/upload.js';
import { browseSchema, createItemSchema } from '../schemas.js';
import {
  cacheItemMedia,
  ensureRoomState,
  itemWithLiveState,
  liveStatesFor,
  mergeLiveState,
} from '../../services/catalog.js';
import { uploadAll, getStorage } from '../../media/storage.js';
import { scheduleAuctionClose } from '../../queue/index.js';
import { log } from '../../log.js';

export const itemsRouter = Router();

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
// A search box must not be able to hand Mongo a regular expression.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  ending: { endTime: 1 },
  newest: { createdAt: -1 },
  price: { currentHighestBidCents: -1 },
};

itemsRouter.get('/items', validate(browseSchema, 'query'), async (req, res) => {
  const { status, q, condition, sellerId, sort, limit, page } = req.valid.query;

  const filter = {};
  if (status && status !== 'ALL') {
    const wanted = status.split(',').filter((s) => ITEM_STATUS[s]);
    if (wanted.length) filter.status = { $in: wanted };
  } else if (!status) {
    filter.status = { $in: [ITEM_STATUS.ACTIVE, ITEM_STATUS.UPCOMING] };
  }
  if (condition) filter.condition = condition;
  if (sellerId && isObjectId(sellerId)) filter.sellerId = sellerId;
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };

  const [items, total] = await Promise.all([
    AuctionItem.find(filter)
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit),
    AuctionItem.countDocuments(filter),
  ]);

  const states = await liveStatesFor(items);
  res.json({
    items: items.map((item) => mergeLiveState(item, states.get(item._id.toString()))),
    page,
    limit,
    total,
    serverNow: Date.now(),
  });
});

// The seller's own shelf, including the drafts and the duds.
itemsRouter.get('/items/mine', requireAuth, async (req, res) => {
  const items = await AuctionItem.find({ sellerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100);
  const states = await liveStatesFor(items);
  res.json({
    items: items.map((item) => ({
      ...mergeLiveState(item, states.get(item._id.toString())),
      // Only the seller ever sees their own floor.
      reservePriceCents: item.reservePriceCents,
    })),
    serverNow: Date.now(),
  });
});

itemsRouter.get('/items/:id', async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const view = await itemWithLiveState(item);
  const isSeller = req.user && item.sellerId.toString() === req.user._id.toString();

  res.json({
    item: {
      ...view,
      nextMinimumCents: minimumBid(item, view.currentHighestBidCents),
      // The client changes state when the clock enters this window, so
      // it has to be told where the window starts rather than guessing.
      softCloseWindowMs: config.softClose.windowMs,
      ...(isSeller ? { reservePriceCents: item.reservePriceCents } : {}),
    },
    serverNow: Date.now(),
  });
});

itemsRouter.get('/items/:id/bids', async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const bids = await Bid.find({ itemId: req.params.id }).sort({ seq: -1 }).limit(limit).lean();
  res.json({
    bids: bids.map((b) => ({
      seq: b.seq,
      amountCents: b.amountCents,
      displayName: b.displayName,
      bidderId: b.bidderId.toString(),
      placedAt: b.placedAt,
      extendedEndTimeTo: b.extendedEndTimeTo,
    })),
    serverNow: Date.now(),
  });
});

// The log, and what it adds up to. A finished auction should be
// checkable by the person who lost it: every accepted bid in order, and
// the winner recomputed from them rather than read off a field.
itemsRouter.get('/items/:id/audit', async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const bids = await Bid.find({ itemId: item._id }).sort({ seq: 1 }).lean();
  const gaps = [];
  bids.forEach((b, i) => {
    if (b.seq !== i + 1) gaps.push({ expected: i + 1, found: b.seq });
  });

  const top = bids.reduce(
    (best, b) => (best && best.amountCents >= b.amountCents ? best : b),
    null,
  );

  res.json({
    itemId: item._id.toString(),
    status: item.status,
    bids: bids.map((b) => ({
      seq: b.seq,
      amountCents: b.amountCents,
      bidderId: b.bidderId.toString(),
      displayName: b.displayName,
      placedAt: b.placedAt,
      extendedEndTimeTo: b.extendedEndTimeTo,
    })),
    recomputed: {
      highestBidCents: top?.amountCents ?? 0,
      winnerId: top?.bidderId?.toString() ?? null,
      bidCount: bids.length,
      extensions: bids.filter((b) => b.extendedEndTimeTo).length,
    },
    stored: {
      highestBidCents: item.currentHighestBidCents,
      winnerId: item.currentWinner?.toString() ?? null,
      bidCount: item.bidCount,
      extensions: item.extensionCount,
    },
    // Non-empty means the log is missing rows the sequence says existed.
    sequenceGaps: gaps,
  });
});

itemsRouter.post('/items', requireSeller, validate(createItemSchema), async (req, res) => {
  const body = req.valid.body;
  const item = await AuctionItem.create({
    ...body,
    sellerId: req.user._id,
    scheduledEndTime: body.endTime,
    status: body.startTime <= new Date() ? ITEM_STATUS.ACTIVE : ITEM_STATUS.UPCOMING,
  });

  if (item.status === ITEM_STATUS.ACTIVE) {
    await ensureRoomState(item);
    await scheduleAuctionClose(item._id.toString(), new Date(item.endTime).getTime());
  }

  log.info('item listed', {
    itemId: item._id.toString(),
    sellerId: req.user._id.toString(),
  });
  res.status(201).json({
    item: { ...item.toPublic(), reservePriceCents: item.reservePriceCents },
  });
});

itemsRouter.post('/items/:id/images', requireSeller, (req, res, next) => {
  uploadImages(req, res, (err) => (err ? next(err) : handleImages(req, res, next)));
});

async function handleImages(req, res) {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (item.sellerId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).json({ error: 'not_your_item' });
  }
  // Photographs are part of what people are bidding on. Changing them
  // once bidding has started changes the thing being sold.
  if (item.status !== ITEM_STATUS.UPCOMING && item.bidCount > 0) {
    return res.status(409).json({
      error: 'bidding_started',
      message: 'Photos are fixed once bidding starts.',
    });
  }
  const files = req.files ?? [];
  if (files.length === 0) return res.status(422).json({ error: 'no_files' });
  if (item.images.length + files.length > 8) {
    return res.status(422).json({ error: 'too_many_images', message: 'Eight photos per item.' });
  }

  const stored = await uploadAll(files);
  item.images.push(...stored);
  await item.save();
  await cacheItemMedia(item);

  res.status(201).json({ images: item.toPublic().images });
}

itemsRouter.delete('/items/:id/images/:handle', requireSeller, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (item.sellerId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).json({ error: 'not_your_item' });
  }
  const handle = decodeURIComponent(req.params.handle);
  const before = item.images.length;
  item.images = item.images.filter((i) => i.handle !== handle);
  if (item.images.length === before) return res.status(404).json({ error: 'no_such_image' });

  await item.save();
  await cacheItemMedia(item);
  await getStorage()
    .remove(handle)
    .catch((err) => log.warn('image delete failed', { handle, err: err.message }));
  res.json({ images: item.toPublic().images });
});
