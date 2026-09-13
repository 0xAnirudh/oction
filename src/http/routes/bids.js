import { Router } from 'express';
import mongoose from 'mongoose';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { placeBidSchema } from '../schemas.js';
import { placeBid } from '../../services/bidding.js';

export const bidsRouter = Router();

bidsRouter.post('/items/:id/bids', requireAuth, validate(placeBidSchema), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: 'not_found' });
  }
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const result = await placeBid({
    item,
    bidder: req.user,
    amountCents: req.valid.body.amountCents,
    ip: req.ip,
  });

  if (!result.ok) {
    if (result.retryAfterMs) res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(result.status).json({
      error: result.code,
      message: result.message,
      // Whatever went wrong, the client wants the current truth back so
      // it can repaint rather than guess.
      currentHighestBidCents: result.highBidCents,
      nextMinimumCents: result.nextMinimumCents,
      endTime: result.endTime,
    });
  }

  res.status(201).json({
    bid: {
      seq: result.seq,
      amountCents: result.amountCents,
      placedAt: result.placedAt,
    },
    currentHighestBidCents: result.amountCents,
    nextMinimumCents: result.nextMinimumCents,
    bidCount: result.bidCount,
    endTime: result.endTime,
    extended: result.extended,
    serverNow: Date.now(),
  });
});
