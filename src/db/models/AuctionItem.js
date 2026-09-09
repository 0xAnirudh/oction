import mongoose from 'mongoose';
import { CONDITIONS, ITEM_STATUS, UNSOLD_REASON } from '../../core/status.js';

// Money is integer cents throughout. A bid path that does arithmetic on
// dollars as floats will eventually reject a bid of 40.15 for being
// under 40.15, and it will do it once, in production, at the close of
// something expensive.

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    thumbUrl: { type: String, required: true },
    // Whatever the storage driver needs to delete the file later.
    handle: { type: String, required: true },
    width: Number,
    height: Number,
  },
  { _id: false },
);

const auctionItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 4000 },
    condition: { type: String, enum: CONDITIONS, required: true },
    images: { type: [imageSchema], default: [] },

    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    startingPriceCents: { type: Number, required: true, min: 1 },
    // Secret floor. 0 means no reserve. Never serialised to a bidder.
    reservePriceCents: { type: Number, default: 0, min: 0 },
    // A seller-pinned raise. Null lets the ladder in core/increments.js
    // decide, which is what most items want.
    bidIncrementCents: { type: Number, default: null, min: 1 },

    // A projection of the bid log, not the source of truth. Redis holds
    // the live figure during the auction and this is written behind it;
    // the log in the Bid collection is what either can be rebuilt from.
    currentHighestBidCents: { type: Number, default: 0 },
    currentWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    bidCount: { type: Number, default: 0 },

    startTime: { type: Date, required: true },
    // Moves when a late bid extends the auction. `scheduledEndTime` is
    // what the seller asked for; `endTime` is what the bidders did to it.
    endTime: { type: Date, required: true, index: true },
    scheduledEndTime: { type: Date, required: true },
    extensionCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(ITEM_STATUS),
      default: ITEM_STATUS.UPCOMING,
      index: true,
    },

    shippingDetails: {
      weightKg: Number,
      shipsFrom: String,
    },

    settlement: {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null,
      },
      soldForCents: { type: Number, default: null },
      settledAt: { type: Date, default: null },
      unsoldReason: {
        type: String,
        enum: [...Object.values(UNSOLD_REASON), null],
        default: null,
      },
      // How far down the bidders we had to walk to find someone who paid.
      rollDowns: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// The catalogue browses by status and closing time; the closer sweeps
// the same pair from the other direction.
auctionItemSchema.index({ status: 1, endTime: 1 });
auctionItemSchema.index({ sellerId: 1, createdAt: -1 });

auctionItemSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    title: this.title,
    description: this.description,
    condition: this.condition,
    images: this.images.map((i) => ({
      url: i.url,
      thumbUrl: i.thumbUrl,
      width: i.width,
      height: i.height,
    })),
    sellerId: this.sellerId?.toString?.() ?? null,
    startingPriceCents: this.startingPriceCents,
    bidIncrementCents: this.bidIncrementCents,
    currentHighestBidCents: this.currentHighestBidCents,
    currentWinner: this.currentWinner?.toString?.() ?? null,
    bidCount: this.bidCount,
    startTime: this.startTime,
    endTime: this.endTime,
    extensionCount: this.extensionCount,
    status: this.status,
    shippingDetails: this.shippingDetails ?? null,
    // The reserve itself stays secret; whether it has been cleared does not.
    hasReserve: this.reservePriceCents > 0,
    reserveMet:
      this.reservePriceCents === 0 || this.currentHighestBidCents >= this.reservePriceCents,
  };
};

export const AuctionItem =
  mongoose.models.AuctionItem ?? mongoose.model('AuctionItem', auctionItemSchema);
