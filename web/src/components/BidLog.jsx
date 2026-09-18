import { formatCents, formatClock } from '../format.js';
import { EmptyState } from './ui.jsx';

// Newest first, and a row that has just arrived flashes once. The
// timestamp is the server's, not the browser's.
export function BidLog({ bids, youId, arrivedSeq }) {
  if (bids.length === 0) {
    return (
      <p className="py-8 text-sm text-graphite">No bids yet. The lot opens at its asking price.</p>
    );
  }

  return (
    <ol className="divide-y divide-rule">
      {bids.map((bid, index) => {
        const mine = bid.bidderId === youId;
        const leading = index === 0;
        return (
          <li
            key={bid.seq}
            className={`flex items-baseline gap-4 px-1 py-2.5 text-sm ${
              bid.seq === arrivedSeq ? 'arriving' : ''
            }`}
          >
            <span className={`flex-1 truncate ${mine ? 'font-medium text-ink' : 'text-graphite'}`}>
              {mine ? 'You' : bid.displayName}
              {leading && (
                <span className="ml-2 text-2xs uppercase tracking-wider text-held">Leading</span>
              )}
              {bid.extendedEndTimeTo && (
                <span className="ml-2 text-2xs text-live">moved the close</span>
              )}
            </span>
            <span className="figures shrink-0 text-ink">{formatCents(bid.amountCents)}</span>
            <span className="figures w-20 shrink-0 text-right text-xs text-graphite">
              {formatClock(bid.placedAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
