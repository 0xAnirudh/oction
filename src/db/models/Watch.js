import mongoose from 'mongoose';

// A saved lot. Distinct from the live watcher count in the room, which
// counts people with the page open right now - this is the list someone
// comes back to, and the list the closing-soon notice goes out to.

const watchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuctionItem', required: true },
  },
  { timestamps: true },
);

// Watching twice is watching once. The unique index is what makes the
// add idempotent without a read first.
watchSchema.index({ userId: 1, itemId: 1 }, { unique: true });
watchSchema.index({ itemId: 1 });

export const Watch = mongoose.models.Watch ?? mongoose.model('Watch', watchSchema);
