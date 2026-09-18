import mongoose from 'mongoose';

// Somebody saying a lot should not be on the site at all - a
// counterfeit, a prohibited item, a description that is a lie.
//
// Distinct from a dispute, which is about an order that went wrong
// between two people. A report is about the listing itself, can be
// filed by anyone who can see it, and is the queue that stops the site
// becoming a venue for selling things that cannot legally be sold.

export const REPORT_REASONS = [
  'prohibited_item',
  'counterfeit',
  'misleading_description',
  'stolen_goods',
  'offensive_content',
  'other',
];

export const REPORT_STATUS = {
  OPEN: 'OPEN',
  UPHELD: 'UPHELD',
  DISMISSED: 'DISMISSED',
};

const reportSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionItem',
      required: true,
      index: true,
    },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    detail: { type: String, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.OPEN,
      index: true,
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

// One open report per person per lot. Reporting twice is not two
// reports; a pile-on should not look like corroboration.
reportSchema.index(
  { itemId: 1, reporterId: 1 },
  { unique: true, partialFilterExpression: { status: REPORT_STATUS.OPEN } },
);

reportSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    itemId: this.itemId.toString(),
    reason: this.reason,
    detail: this.detail,
    status: this.status,
    createdAt: this.createdAt,
  };
};

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema);
