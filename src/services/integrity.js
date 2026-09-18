import { AuctionItem } from '../db/models/AuctionItem.js';
import { Bid } from '../db/models/Bid.js';
import { Order } from '../db/models/Order.js';
import { User } from '../db/models/User.js';
import { ORDER_STATUS } from '../core/status.js';

// Looking for a seller bidding on their own lots through somebody else.
//
// The direct case is already refused - the bid script will not take a
// bid from the account that listed the lot. The case that matters is a
// second account, and no single fact proves it. What this does is
// gather the facts that tend to travel with it, weight them, and put
// the result in front of a person. It accuses nobody; a high score is a
// reason to look, not a finding.
//
// Nothing here uses an IP address. Bids carry a salted digest of one,
// which can answer "same connection as the seller" without the system
// ever holding the address itself.

const SIGNALS = {
  SHARED_CONNECTION: {
    weight: 55,
    text: 'Bid from the same connection the seller signed up from',
  },
  SHARED_SIGNUP: {
    weight: 45,
    text: 'Account opened from the same connection as the seller',
  },
  PUSHES_NEVER_WINS: {
    weight: 30,
    text: 'Bids often on this seller and almost never takes the item',
  },
  ONLY_THIS_SELLER: {
    weight: 25,
    text: 'Has bid on nothing outside this seller',
  },
  NEW_ACCOUNT: {
    weight: 10,
    text: 'Account opened shortly before it started bidding here',
  },
};

const DAY = 86_400_000;

export async function shillSignals(sellerId) {
  const items = await AuctionItem.find({ sellerId }).select('_id').lean();
  const itemIds = items.map((i) => i._id);
  if (itemIds.length === 0) return { lots: 0, suspects: [] };

  const seller = await User.findById(sellerId).select('signupIpHash createdAt').lean();

  const perBidder = await Bid.aggregate([
    { $match: { itemId: { $in: itemIds } } },
    {
      $group: {
        _id: '$bidderId',
        lots: { $addToSet: '$itemId' },
        bidCount: { $sum: 1 },
        ipHashes: { $addToSet: '$ipHash' },
        firstAt: { $min: '$placedAt' },
        lastAt: { $max: '$placedAt' },
      },
    },
  ]);
  if (perBidder.length === 0) return { lots: itemIds.length, suspects: [] };

  const bidderIds = perBidder.map((b) => b._id);

  const [wins, totals, users] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          buyerId: { $in: bidderIds },
          itemId: { $in: itemIds },
          status: { $in: [ORDER_STATUS.PAID, ORDER_STATUS.PENDING] },
        },
      },
      { $group: { _id: '$buyerId', won: { $sum: 1 } } },
    ]),
    // How much of each bidder's whole history is this one seller.
    Bid.aggregate([
      { $match: { bidderId: { $in: bidderIds } } },
      { $group: { _id: '$bidderId', total: { $sum: 1 }, lots: { $addToSet: '$itemId' } } },
    ]),
    User.find({ _id: { $in: bidderIds } })
      .select('displayName email signupIpHash createdAt deletedAt')
      .lean(),
  ]);

  const wonBy = new Map(wins.map((w) => [w._id.toString(), w.won]));
  const totalBy = new Map(totals.map((t) => [t._id.toString(), t]));
  const userBy = new Map(users.map((u) => [u._id.toString(), u]));

  const suspects = [];

  for (const row of perBidder) {
    const id = row._id.toString();
    const user = userBy.get(id);
    if (!user) continue;

    const lotsBidOn = row.lots.length;
    const won = wonBy.get(id) ?? 0;
    const everywhere = totalBy.get(id);
    const reasons = [];

    if (seller?.signupIpHash && row.ipHashes.filter(Boolean).includes(seller.signupIpHash)) {
      reasons.push(SIGNALS.SHARED_CONNECTION);
    }
    if (seller?.signupIpHash && user.signupIpHash && user.signupIpHash === seller.signupIpHash) {
      reasons.push(SIGNALS.SHARED_SIGNUP);
    }
    // Three lots is where a pattern starts being a pattern rather than
    // somebody who likes what this seller sells.
    if (lotsBidOn >= 3 && won / lotsBidOn <= 0.2) {
      reasons.push(SIGNALS.PUSHES_NEVER_WINS);
    }
    if (everywhere && everywhere.lots.length === lotsBidOn && lotsBidOn >= 2) {
      reasons.push(SIGNALS.ONLY_THIS_SELLER);
    }
    if (user.createdAt && row.firstAt - new Date(user.createdAt).getTime() < DAY) {
      reasons.push(SIGNALS.NEW_ACCOUNT);
    }

    if (reasons.length === 0) continue;

    // Capped rather than summed past 100, so a suspect with four
    // moderate signals does not outrank one with a decisive signal.
    const score = Math.min(
      100,
      reasons.reduce((sum, r) => sum + r.weight, 0),
    );

    suspects.push({
      bidderId: id,
      displayName: user.displayName,
      lotsBidOn,
      bidCount: row.bidCount,
      won,
      score,
      reasons: reasons.map((r) => r.text),
      lastAt: row.lastAt,
    });
  }

  suspects.sort((a, b) => b.score - a.score);
  return { lots: itemIds.length, suspects };
}

// The site-wide sweep behind the staff queue: which sellers have
// anybody worth a second look.
export async function flaggedSellers({ minScore = 45, limit = 25 } = {}) {
  const sellers = await AuctionItem.distinct('sellerId');
  const flagged = [];

  for (const sellerId of sellers.slice(0, 200)) {
    const { suspects } = await shillSignals(sellerId);
    const worst = suspects.filter((s) => s.score >= minScore);
    if (worst.length === 0) continue;

    const seller = await User.findById(sellerId).select('displayName email').lean();
    flagged.push({
      sellerId: sellerId.toString(),
      displayName: seller?.displayName ?? 'Unknown',
      email: seller?.email ?? null,
      suspects: worst.length,
      topScore: worst[0].score,
    });
    if (flagged.length >= limit) break;
  }

  flagged.sort((a, b) => b.topScore - a.topScore);
  return flagged;
}
