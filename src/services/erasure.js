import crypto from 'node:crypto';
import { User } from '../db/models/User.js';
import { Bid } from '../db/models/Bid.js';
import { Order } from '../db/models/Order.js';
import { Watch } from '../db/models/Watch.js';
import { Token } from '../db/models/Token.js';
import { Dispute, DISPUTE_STATUS } from '../db/models/Dispute.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { ITEM_STATUS, ORDER_STATUS } from '../core/status.js';
import { revokeAll } from './sessions.js';
import { log } from '../log.js';

// Closing an account, honestly.
//
// A right to erasure is not a right to unwind a finished auction. The
// bid log is what makes a leaderboard of prices checkable and what a
// dispute is decided on; deleting rows out of it would rewrite the
// history of transactions other people were party to, and those people
// have their own claim on that record.
//
// So the account is anonymised rather than removed: everything that
// identifies a person goes, and the rows that record what happened
// stay, with the name on them replaced. That is the shape the law
// actually asks for - erase the personal data, keep what is needed for
// a contract you were part of.

export const ERASURE_BLOCKERS = {
  LIVE_LISTINGS: 'live_listings',
  UNPAID_ORDERS: 'unpaid_orders',
  OPEN_DISPUTES: 'open_disputes',
};

// Things that must be finished first, because closing an account in the
// middle of them would strand somebody else.
export async function erasureBlockers(user) {
  const [listings, orders, disputes] = await Promise.all([
    AuctionItem.countDocuments({
      sellerId: user._id,
      status: { $in: [ITEM_STATUS.ACTIVE, ITEM_STATUS.UPCOMING, ITEM_STATUS.ENDED] },
    }),
    Order.countDocuments({
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
      status: ORDER_STATUS.PENDING,
    }),
    Dispute.countDocuments({
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
      status: DISPUTE_STATUS.OPEN,
    }),
  ]);

  const blockers = [];
  if (listings > 0) blockers.push({ code: ERASURE_BLOCKERS.LIVE_LISTINGS, count: listings });
  if (orders > 0) blockers.push({ code: ERASURE_BLOCKERS.UNPAID_ORDERS, count: orders });
  if (disputes > 0) blockers.push({ code: ERASURE_BLOCKERS.OPEN_DISPUTES, count: disputes });
  return blockers;
}

export const BLOCKER_TEXT = {
  [ERASURE_BLOCKERS.LIVE_LISTINGS]:
    'You have lots that are running or waiting to settle. They have to finish first.',
  [ERASURE_BLOCKERS.UNPAID_ORDERS]:
    'You have an order that has not been paid for. Complete or let it lapse first.',
  [ERASURE_BLOCKERS.OPEN_DISPUTES]:
    'You have an open dispute. It has to be resolved before the account can close.',
};

export async function eraseAccount(user) {
  const blockers = await erasureBlockers(user);
  if (blockers.length > 0) return { error: 'blocked', blockers };

  const id = user._id.toString();
  const now = new Date();

  // The name on past bids becomes a tombstone. The rows stay, so the
  // audit endpoint still adds up and a dispute over a past sale can
  // still be read.
  await Bid.updateMany({ bidderId: user._id }, { $set: { displayName: 'Closed account' } });

  // Things that are only ever about this person go entirely.
  await Promise.all([
    Watch.deleteMany({ userId: user._id }),
    Token.deleteMany({ userId: user._id }),
  ]);

  // Shipping addresses on settled orders are the one identifying field
  // that is not needed once the thing has shipped.
  await Order.updateMany({ buyerId: user._id }, { $unset: { shipping: '' } });

  user.email = `closed-${id}@account.invalid`;
  user.displayName = 'Closed account';
  // Not a hash of anything anyone knows, so there is nothing to guess.
  user.passwordHash = `scrypt$0$0$0$${crypto.randomBytes(8).toString('base64')}$${crypto
    .randomBytes(32)
    .toString('base64')}`;
  user.defaultShipping = undefined;
  user.signupIpHash = null;
  user.sellerStatus = 'unverified';
  user.isAdmin = false;
  user.emailVerified = false;
  user.notify = { outbid: false, won: false, closingSoon: false };
  user.deletedAt = now;
  // Belt and braces: the cutoff refuses any token, and every session
  // row is revoked so none can be listed or reused.
  user.sessionsValidFrom = now;
  await user.save();

  await revokeAll(user._id);

  log.info('account closed', { userId: id });
  return { erased: true };
}
