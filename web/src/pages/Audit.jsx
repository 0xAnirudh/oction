import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatClock } from '../format.js';
import { Banner, RowSkeleton, EmptyState, Button } from '../components/ui.jsx';
import { ChevronIcon } from '../components/icons.jsx';

// The log, and the winner recomputed from it. Anyone who lost a lot can
// read this and check the arithmetic rather than take a field's word
// for who won.
export function Audit() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get(`/items/${id}/audit`)
      .then(setAudit)
      .catch(() => setFailed(true));
  }, [id]);

  if (failed) {
    return (
      <EmptyState
        title="No log for that lot."
        action={<Button to="/">Back to the catalogue</Button>}
      />
    );
  }

  if (!audit) {
    return (
      <div className="max-w-2xl space-y-3 py-6">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    );
  }

  const agrees =
    audit.recomputed.highestBidCents === audit.stored.highestBidCents &&
    audit.recomputed.winnerId === audit.stored.winnerId &&
    audit.sequenceGaps.length === 0;

  return (
    <div className="max-w-2xl">
      <Link
        to={`/lot/${id}`}
        className="inline-flex items-center gap-1 text-xs text-graphite transition-colors hover:text-ink"
      >
        <ChevronIcon dir="left" size={13} />
        Back to the lot
      </Link>

      <h1 className="display mt-4 text-3xl text-ink">The bid log</h1>
      <p className="measure mt-3 text-sm text-graphite">
        Every accepted bid in the order the server took it. The figures below are recomputed from
        these rows, not read off the lot — so if the two ever disagreed, this page would say so.
      </p>

      <div className="mt-6">
        {agrees ? (
          <Banner tone="held">
            The log and the lot agree: {formatCents(audit.recomputed.highestBidCents)} over{' '}
            {audit.recomputed.bidCount} {audit.recomputed.bidCount === 1 ? 'bid' : 'bids'}, no gaps
            in the sequence.
          </Banner>
        ) : (
          <Banner tone="live">
            The log and the lot disagree. {audit.sequenceGaps.length} gaps in the sequence.
          </Banner>
        )}
      </div>

      {audit.bids.length === 0 ? (
        <p className="py-10 text-sm text-graphite">Nobody bid on this lot.</p>
      ) : (
        <ol className="mt-8 divide-y divide-rule border-t border-rule">
          {audit.bids.map((bid) => (
            <li key={bid.seq} className="flex items-baseline gap-4 py-3 text-sm">
              <span className="figures w-8 shrink-0 text-xs text-graphite">{bid.seq}</span>
              <span className="flex-1 truncate text-ink">{bid.displayName}</span>
              {bid.extendedEndTimeTo && (
                <span className="shrink-0 text-2xs text-live">moved the close</span>
              )}
              <span className="figures shrink-0 text-ink">{formatCents(bid.amountCents)}</span>
              <span className="figures w-20 shrink-0 text-right text-xs text-graphite">
                {formatClock(bid.placedAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
