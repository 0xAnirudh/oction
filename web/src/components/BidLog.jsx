import { formatCents, formatClock } from '../format.js';

// Newest first, and a row that has just arrived flashes once. The
// timestamp is the server's, not the browser's.
export function BidLog({ bids, youId, arrivedSeq }) {
  if (bids.length === 0) {
    return (
      <p className="py-6 text-sm text-graphite">No bids yet. The lot opens at its asking price.</p>
    );
  }

  return (
    <ol className="divide-y divide-rule">
      {bids.map((bid) => {
        const mine = bid.bidderId === youId;
        return (
          <li
            key={bid.seq}
            className={`flex items-baseline justify-between gap-4 px-1 py-2.5 text-sm ${
              bid.seq === arrivedSeq ? 'arriving' : ''
            }`}
          >
            <span className={mine ? 'font-medium text-ink' : 'text-graphite'}>
              {mine ? 'You' : bid.displayName}
              {bid.extendedEndTimeTo && (
                <span className="ml-2 text-xs text-live">extended the lot</span>
              )}
            </span>
            <span className="figures text-ink">{formatCents(bid.amountCents)}</span>
            <span className="figures w-20 shrink-0 text-right text-xs text-graphite">
              {formatClock(bid.placedAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
