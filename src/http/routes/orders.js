import { Router } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../db/models/Order.js';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { ORDER_STATUS } from '../../core/status.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { checkoutSchema } from '../schemas.js';
import { payOrder } from '../../services/settlement.js';

export const ordersRouter = Router();

// What is waiting on me, and what I have already paid for.
ordersRouter.get('/orders/mine', requireAuth, async (req, res) => {
  const orders = await Order.find({ buyerId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  const items = await AuctionItem.find({
    _id: { $in: orders.map((o) => o.itemId) },
  });
  const byId = new Map(items.map((i) => [i._id.toString(), i]));

  res.json({
    orders: orders.map((order) => ({
      ...order.toPublic(),
      item: byId.get(order.itemId.toString())?.toPublic() ?? null,
      // The clock the winning screen counts down.
      remainingMs:
        order.status === ORDER_STATUS.PENDING
          ? Math.max(0, order.expiresAt.getTime() - Date.now())
          : 0,
    })),
    serverNow: Date.now(),
  });
});

// What the seller is owed.
ordersRouter.get('/orders/sold', requireAuth, async (req, res) => {
  const orders = await Order.find({ sellerId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ orders: orders.map((o) => o.toPublic()), serverNow: Date.now() });
});

ordersRouter.get('/orders/:id', requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(404).json({ error: 'not_found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });

  const mine = [order.buyerId.toString(), order.sellerId.toString()].includes(
    req.user._id.toString(),
  );
  if (!mine && !req.user.isAdmin) return res.status(403).json({ error: 'not_yours' });

  const item = await AuctionItem.findById(order.itemId);
  res.json({
    order: {
      ...order.toPublic(),
      item: item?.toPublic() ?? null,
      remainingMs:
        order.status === ORDER_STATUS.PENDING
          ? Math.max(0, order.expiresAt.getTime() - Date.now())
          : 0,
    },
    serverNow: Date.now(),
  });
});

const CHECKOUT_ERRORS = {
  not_yours: 'This order belongs to someone else.',
  not_pending: 'This order has already been resolved.',
  expired: 'The checkout window closed and the item moved on.',
};

ordersRouter.post(
  '/orders/:id/checkout',
  requireAuth,
  validate(checkoutSchema),
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(404).json({ error: 'not_found' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'not_found' });

    const result = await payOrder({
      order,
      user: req.user,
      shipping: req.valid.body.shipping,
    });

    if (result.error) {
      return res
        .status(result.status)
        .json({ error: result.error, message: CHECKOUT_ERRORS[result.error] });
    }
    res.json({ order: result.order.toPublic() });
  },
);
