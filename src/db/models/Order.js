import mongoose from 'mongoose';
import { ORDER_STATUS } from '../../core/status.js';

// A claim on an item, with a clock on it. Created when the hammer falls
// and the winner is offered the item; it either becomes PAID inside the
// checkout window or EXPIRED, at which point the item rolls down and a
// new order is cut for the next bidder.

const orderSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionItem',
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    amountCents: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    // 1 is the winner, 2 the runner-up, and so on down.
    offerRank: { type: Number, required: true, min: 1 },

    reservedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null },

    shipping: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      region: String,
      postcode: String,
      country: String,
    },

    // Stands in for a payment intent id until a processor is wired in.
    paymentRef: { type: String, default: null },
  },
  { timestamps: true },
);

// At most one live claim on an item at a time. A partial index so
// expired and paid orders do not collide with the next one down.
orderSchema.index(
  { itemId: 1 },
  { unique: true, partialFilterExpression: { status: ORDER_STATUS.PENDING } },
);

orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    itemId: this.itemId.toString(),
    amountCents: this.amountCents,
    status: this.status,
    offerRank: this.offerRank,
    reservedAt: this.reservedAt,
    expiresAt: this.expiresAt,
    paidAt: this.paidAt,
    shipping: this.shipping ?? null,
  };
};

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
