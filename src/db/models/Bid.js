import mongoose from 'mongoose';

// The bid log. This collection is not in the original data model, and
// the system does not work without it.
//
// Two reasons. The first is Phase 4: when a winner fails to check out
// the item rolls down to the runner-up, and `currentWinner` on the item
// cannot tell you who that is - it holds one name. Rolling down needs
// the ordered history of distinct bidders, which is this.
//
// The second is that `currentHighestBid` lives in Redis during the
// auction, where an eviction or an unclean shutdown can take it. An
// append-only log makes the live figure a derivable quantity rather than
// the only copy: the room can be rebuilt from Mongo, and a settled
// auction can be handed to a stranger as a list of rows for them to
// arrive at the same winner.
//
// Rows are written by the API immediately after Redis accepts a bid, and
// only then - the Lua script is what decides, this is what remembers.

const bidSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionItem',
      required: true,
    },
    bidderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    displayName: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 1 },

    // Assigned by the Lua script. Gap-free and strictly increasing per
    // item, so a missing number means a row never made it out of the API
    // and the log knows it is incomplete.
    seq: { type: Number, required: true },

    // Server clock at the moment Redis accepted it, not at the moment
    // the row was written.
    placedAt: { type: Date, required: true },

    // Salted digest of the bidder's address, never the address. It is
    // what lets integrity.js notice a seller bidding on their own lots
    // from a second account without the system holding anyone's IP.
    ipHash: { type: String, default: null },
    // What the bid did to the closing time, if anything.
    extendedEndTimeTo: { type: Date, default: null },
  },
  { timestamps: true },
);

// One row per sequence number per item. If the API retries a write after
// a timeout, the duplicate key is the thing that stops it landing twice.
bidSchema.index({ itemId: 1, seq: 1 }, { unique: true });
bidSchema.index({ itemId: 1, amountCents: -1 });
bidSchema.index({ bidderId: 1, createdAt: -1 });

export const Bid = mongoose.models.Bid ?? mongoose.model('Bid', bidSchema);
