import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatClock } from '../format.js';
import { Banner } from '../components/ui.jsx';

// The log, and the winner recomputed from it. Anyone who lost a lot can
// read this and check the arithmetic rather than take a field's word for
// who won.
export function Audit() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);

  useEffect(() => {
    api
      .get(`/items/${id}/audit`)
      .then(setAudit)
      .catch(() => setAudit({ error: true }));
  }, [id]);

  if (!audit) return <p className="py-16 text-sm text-graphite">Loading the log…</p>;
  if (audit.error) return <p className="py-16 text-sm text-graphite">No log for that lot.</p>;

  const agrees =
    audit.recomputed.highestBidCents === audit.stored.highestBidCents &&
    audit.recomputed.winnerId === audit.stored.winnerId &&
    audit.sequenceGaps.length === 0;

  return (
    <div className="max-w-2xl">
      <Link to={`/lot/${id}`} className="text-sm text-graphite hover:text-ink">
        Back to the lot
      </Link>
      <h1 className="display mt-4 text-3xl text-ink">The bid log</h1>
      <p className="mt-2 text-sm text-graphite">
        Every accepted bid in the order the server took it. The figures below are recomputed from
        these rows, not read from the lot.
      </p>

      <div className="mt-6">
        {agrees ? (
          <Banner tone="held">
            The log and the lot agree: {formatCents(audit.recomputed.highestBidCents)} over{' '}
            {audit.recomputed.bidCount} bids, no gaps in the sequence.
          </Banner>
        ) : (
          <Banner tone="live">
            The log and the lot disagree. {audit.sequenceGaps.length} sequence gaps.
          </Banner>
        )}
      </div>

      <ol className="mt-8 divide-y divide-rule border-t border-rule">
        {audit.bids.map((bid) => (
          <li key={bid.seq} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <span className="figures w-10 shrink-0 text-graphite">{bid.seq}</span>
            <span className="flex-1 text-ink">{bid.displayName}</span>
            <span className="figures text-ink">{formatCents(bid.amountCents)}</span>
            <span className="figures w-24 shrink-0 text-right text-xs text-graphite">
              {formatClock(bid.placedAt)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
