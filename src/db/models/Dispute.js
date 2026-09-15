import mongoose from 'mongoose';

// A buyer saying the thing they paid for is not the thing they got.
//
// Opened against a paid order, never against a bid: until money has
// moved there is nothing to dispute, and an unpaid order already has
// its own outcome in the roll-down.

export const DISPUTE_REASONS = ['not_received', 'not_as_described', 'damaged', 'other'];

export const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  RESOLVED_BUYER: 'RESOLVED_BUYER',
  RESOLVED_SELLER: 'RESOLVED_SELLER',
  WITHDRAWN: 'WITHDRAWN',
};

const disputeSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuctionItem', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    reason: { type: String, enum: DISPUTE_REASONS, required: true },
    detail: { type: String, default: '', maxlength: 4000 },

    status: {
      type: String,
      enum: Object.values(DISPUTE_STATUS),
      default: DISPUTE_STATUS.OPEN,
      index: true,
    },

    resolution: { type: String, default: '', maxlength: 4000 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// One live dispute per order. A buyer who wants to add to their case
// should reopen the conversation, not file a second one.
disputeSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: DISPUTE_STATUS.OPEN } },
);

disputeSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    itemId: this.itemId.toString(),
    buyerId: this.buyerId.toString(),
    sellerId: this.sellerId.toString(),
    reason: this.reason,
    detail: this.detail,
    status: this.status,
    resolution: this.resolution,
    resolvedAt: this.resolvedAt,
    createdAt: this.createdAt,
  };
};

export const Dispute = mongoose.models.Dispute ?? mongoose.model('Dispute', disputeSchema);
