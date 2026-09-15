// An item walks UPCOMING -> ACTIVE -> ENDED, and then ENDED resolves
// into SETTLED or UNSOLD once the checkout window has had its say.
// ENDED is the interesting state: the hammer has fallen but the item is
// not yet anybody's, because the winner still has to pay for it.

export const ITEM_STATUS = {
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  SETTLED: 'SETTLED',
  UNSOLD: 'UNSOLD',
};

export const CONDITIONS = ['Brand New', 'Like New', 'Used', 'Vintage'];

export const ORDER_STATUS = {
  PENDING: 'PENDING', // holding the item, clock running
  PAID: 'PAID',
  EXPIRED: 'EXPIRED', // ran out of clock, item rolled down
  CANCELLED: 'CANCELLED', // bidder declined
};

export const UNSOLD_REASON = {
  NO_BIDS: 'no_bids',
  RESERVE_NOT_MET: 'reserve_not_met',
  NO_TAKERS: 'all_bidders_failed_checkout',
  WITHDRAWN: 'withdrawn_by_staff',
};
