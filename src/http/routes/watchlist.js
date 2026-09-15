import { Router } from 'express';
import mongoose from 'mongoose';
import { Watch } from '../../db/models/Watch.js';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { requireAuth } from '../middleware/authenticate.js';
import { liveStatesFor, mergeLiveState } from '../../services/catalog.js';

export const watchlistRouter = Router();

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

watchlistRouter.get('/watchlist', requireAuth, async (req, res) => {
  const watches = await Watch.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const items = await AuctionItem.find({ _id: { $in: watches.map((w) => w.itemId) } });

  // Closing first - a watchlist is a queue of things about to happen.
  const states = await liveStatesFor(items);
  const merged = items
    .map((item) => mergeLiveState(item, states.get(item._id.toString())))
    .sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

  res.json({ items: merged, serverNow: Date.now() });
});

watchlistRouter.put('/items/:id/watch', requireAuth, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id).select('_id');
  if (!item) return res.status(404).json({ error: 'not_found' });

  // Upsert rather than insert: watching something twice is watching it.
  await Watch.updateOne(
    { userId: req.user._id, itemId: item._id },
    { $setOnInsert: { userId: req.user._id, itemId: item._id } },
    { upsert: true },
  );

  res.json({ watching: true });
});

watchlistRouter.delete('/items/:id/watch', requireAuth, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  await Watch.deleteOne({ userId: req.user._id, itemId: req.params.id });
  res.json({ watching: false });
});
