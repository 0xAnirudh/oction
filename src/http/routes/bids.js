import { Router } from 'express';
import mongoose from 'mongoose';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { placeBidSchema } from '../schemas.js';
import { placeBid } from '../../services/bidding.js';
import { begin, finish, release, isValidKey } from '../../services/idempotency.js';
import { log } from '../../log.js';

export const bidsRouter = Router();

bidsRouter.post('/items/:id/bids', requireAuth, validate(placeBidSchema), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: 'not_found' });
  }

  const userId = req.user._id.toString();
  const rawKey = req.get('idempotency-key');

  // The key is scoped to the item as well as the user, so the same
  // client reusing a key across two lots cannot be handed the wrong
  // lot's answer.
  const key = isValidKey(rawKey) ? `${req.params.id}:${rawKey}` : null;

  if (rawKey && !key) {
    return res.status(400).json({
      error: 'bad_idempotency_key',
      message: 'Idempotency-Key must be a string of 200 characters or fewer.',
    });
  }

  if (key) {
    const claim = await begin(userId, key);
    if (claim.state === 'done') {
      // Same request, same answer, no second bid.
      res.set('Idempotent-Replay', 'true');
      return res.status(claim.replay.status).json(claim.replay.body);
    }
    if (claim.state === 'in_flight') {
      return res.status(409).json({
        error: 'in_flight',
        message: 'That bid is already being processed.',
      });
    }
  }

  const send = async (status, body) => {
    if (key) await finish(userId, key, status, body);
    return res.status(status).json(body);
  };

  try {
    const item = await AuctionItem.findById(req.params.id);
    if (!item) return send(404, { error: 'not_found' });

    const result = await placeBid({
      item,
      bidder: req.user,
      amountCents: req.valid.body.amountCents,
      ip: req.ip,
    });

    if (!result.ok) {
      if (result.retryAfterMs) res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      return send(result.status, {
        error: result.code,
        message: result.message,
        // Whatever went wrong, the client wants the current truth back
        // so it can repaint rather than guess.
        currentHighestBidCents: result.highBidCents,
        nextMinimumCents: result.nextMinimumCents,
        endTime: result.endTime,
      });
    }

    return send(201, {
      bid: { seq: result.seq, amountCents: result.amountCents, placedAt: result.placedAt },
      currentHighestBidCents: result.amountCents,
      nextMinimumCents: result.nextMinimumCents,
      bidCount: result.bidCount,
      endTime: result.endTime,
      extended: result.extended,
      serverNow: Date.now(),
    });
  } catch (err) {
    // The failure was ours, not the request's. Drop the claim so a retry
    // is allowed rather than being told it is still in flight.
    if (key) await release(userId, key);
    log.error('bid failed', { itemId: req.params.id, err: err.message });
    throw err;
  }
});
