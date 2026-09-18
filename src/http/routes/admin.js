import { Router } from 'express';
import mongoose from 'mongoose';
import { User } from '../../db/models/User.js';
import { AuctionItem } from '../../db/models/AuctionItem.js';
import { Order } from '../../db/models/Order.js';
import { Dispute, DISPUTE_STATUS } from '../../db/models/Dispute.js';
import { ITEM_STATUS, ORDER_STATUS } from '../../core/status.js';
import { requireAdmin } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  resolveDisputeSchema,
  resolveReportSchema,
  sellerDecisionSchema,
  withdrawItemSchema,
} from '../schemas.js';
import { Report, REPORT_STATUS } from '../../db/models/Report.js';
import { flaggedSellers, shillSignals } from '../../services/integrity.js';
import { withdrawItem } from '../../services/settlement.js';
import { log } from '../../log.js';

export const adminRouter = Router();

// Everything below is staff-only, and answers 404 to everyone else.
adminRouter.use('/admin', requireAdmin);

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

adminRouter.get('/admin/overview', async (_req, res) => {
  const [pendingSellers, openDisputes, liveItems, pendingOrders, openReports] = await Promise.all([
    User.countDocuments({ sellerStatus: 'pending' }),
    Dispute.countDocuments({ status: DISPUTE_STATUS.OPEN }),
    AuctionItem.countDocuments({ status: ITEM_STATUS.ACTIVE }),
    Order.countDocuments({ status: ORDER_STATUS.PENDING }),
    Report.countDocuments({ status: REPORT_STATUS.OPEN }),
  ]);
  res.json({
    pendingSellers,
    openDisputes,
    liveItems,
    pendingOrders,
    openReports,
    serverNow: Date.now(),
  });
});

// --- seller verification ------------------------------------------

adminRouter.get('/admin/sellers', async (req, res) => {
  const status = ['unverified', 'pending', 'verified'].includes(req.query.status)
    ? req.query.status
    : 'pending';
  const users = await User.find({ sellerStatus: status }).sort({ updatedAt: -1 }).limit(100);
  res.json({
    users: users.map((u) => ({
      id: u._id.toString(),
      displayName: u.displayName,
      email: u.email,
      emailVerified: u.emailVerified,
      sellerStatus: u.sellerStatus,
      appliedAt: u.updatedAt,
    })),
  });
});

adminRouter.post('/admin/sellers/:id/verify', validate(sellerDecisionSchema), async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });

  // An unconfirmed address cannot be a seller. Payouts and disputes
  // both need a way to reach them that has been shown to work.
  if (!user.emailVerified) {
    return res.status(409).json({
      error: 'email_not_verified',
      message: 'This account has not confirmed its email address.',
    });
  }

  user.sellerStatus = 'verified';
  await user.save();
  log.info('seller verified', { userId: user._id.toString(), by: req.user._id.toString() });
  res.json({ user: user.toPublic() });
});

adminRouter.post('/admin/sellers/:id/reject', validate(sellerDecisionSchema), async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { sellerStatus: 'unverified' } },
    { new: true },
  );
  if (!user) return res.status(404).json({ error: 'not_found' });
  log.info('seller rejected', { userId: user._id.toString(), by: req.user._id.toString() });
  res.json({ user: user.toPublic() });
});

// --- listings ------------------------------------------------------

adminRouter.post('/admin/items/:id/withdraw', validate(withdrawItemSchema), async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const item = await AuctionItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const result = await withdrawItem(item, req.valid.body.reason, req.user._id.toString());
  if (result.error) {
    return res.status(409).json({ error: result.error, message: 'That lot is already resolved.' });
  }
  res.json({ item: result.item.toPublic() });
});

// --- disputes ------------------------------------------------------

adminRouter.get('/admin/disputes', async (req, res) => {
  const status = Object.values(DISPUTE_STATUS).includes(req.query.status)
    ? req.query.status
    : DISPUTE_STATUS.OPEN;

  const disputes = await Dispute.find({ status }).sort({ createdAt: 1 }).limit(100);
  const items = await AuctionItem.find({ _id: { $in: disputes.map((d) => d.itemId) } });
  const byId = new Map(items.map((i) => [i._id.toString(), i]));

  res.json({
    disputes: disputes.map((d) => ({
      ...d.toPublic(),
      item: byId.get(d.itemId.toString())?.toPublic() ?? null,
    })),
  });
});

adminRouter.post(
  '/admin/disputes/:id/resolve',
  validate(resolveDisputeSchema),
  async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'not_found' });
    if (dispute.status !== DISPUTE_STATUS.OPEN) {
      return res.status(409).json({ error: 'already_resolved' });
    }

    dispute.status =
      req.valid.body.outcome === 'buyer'
        ? DISPUTE_STATUS.RESOLVED_BUYER
        : DISPUTE_STATUS.RESOLVED_SELLER;
    dispute.resolution = req.valid.body.resolution;
    dispute.resolvedAt = new Date();
    dispute.resolvedBy = req.user._id;
    await dispute.save();

    // Deciding for the buyer is where a refund would be issued. There is
    // no processor wired in yet, so the record is the whole outcome -
    // and it is recorded rather than implied so the refund has something
    // to hang off when there is one.
    log.info('dispute resolved', {
      disputeId: dispute._id.toString(),
      outcome: req.valid.body.outcome,
      by: req.user._id.toString(),
    });

    res.json({ dispute: dispute.toPublic() });
  },
);

// --- reported listings ----------------------------------------------

adminRouter.get('/admin/reports', async (req, res) => {
  const status = Object.values(REPORT_STATUS).includes(req.query.status)
    ? req.query.status
    : REPORT_STATUS.OPEN;

  const reports = await Report.find({ status }).sort({ createdAt: 1 }).limit(100);
  const items = await AuctionItem.find({ _id: { $in: reports.map((r) => r.itemId) } });
  const byId = new Map(items.map((i) => [i._id.toString(), i]));

  // Several people reporting the same lot is the signal worth surfacing,
  // so the count travels with each row.
  const counts = await Report.aggregate([
    { $match: { status: REPORT_STATUS.OPEN } },
    { $group: { _id: '$itemId', total: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c) => [c._id.toString(), c.total]));

  res.json({
    reports: reports.map((r) => ({
      ...r.toPublic(),
      item: byId.get(r.itemId.toString())?.toPublic() ?? null,
      reportsOnThisItem: countBy.get(r.itemId.toString()) ?? 1,
    })),
  });
});

adminRouter.post('/admin/reports/:id/resolve', validate(resolveReportSchema), async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'not_found' });
  if (report.status !== REPORT_STATUS.OPEN) {
    return res.status(409).json({ error: 'already_resolved' });
  }

  const upheld = req.valid.body.outcome === 'uphold';
  report.status = upheld ? REPORT_STATUS.UPHELD : REPORT_STATUS.DISMISSED;
  report.note = req.valid.body.note;
  report.resolvedAt = new Date();
  report.resolvedBy = req.user._id;
  await report.save();

  let withdrawn = false;
  if (upheld && req.valid.body.withdrawItem) {
    const item = await AuctionItem.findById(report.itemId);
    if (item) {
      const result = await withdrawItem(
        item,
        `report upheld: ${report.reason}`,
        req.user._id.toString(),
      );
      withdrawn = !result.error;
      // Everything else open against the same lot is decided by this.
      if (withdrawn) {
        await Report.updateMany(
          { itemId: item._id, status: REPORT_STATUS.OPEN },
          {
            $set: {
              status: REPORT_STATUS.UPHELD,
              resolvedAt: new Date(),
              resolvedBy: req.user._id,
              note: 'Resolved with the listing withdrawal.',
            },
          },
        );
      }
    }
  }

  res.json({ report: report.toPublic(), withdrawn });
});

// --- auction integrity ------------------------------------------------

adminRouter.get('/admin/integrity', async (_req, res) => {
  const sellers = await flaggedSellers();
  res.json({ sellers });
});

adminRouter.get('/admin/integrity/sellers/:id', async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const result = await shillSignals(req.params.id);
  res.json(result);
});
