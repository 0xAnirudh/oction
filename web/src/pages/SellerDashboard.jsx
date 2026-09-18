import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatCents, formatWhen } from '../format.js';
import { Countdown, useRemaining } from '../components/Countdown.jsx';
import { Button, Banner, EmptyState, RowSkeleton, Readout } from '../components/ui.jsx';
import { PlusIcon } from '../components/icons.jsx';

const STATUS_TONE = {
  ACTIVE: 'text-ink',
  UPCOMING: 'text-graphite',
  ENDED: 'text-graphite',
  SETTLED: 'text-held',
  UNSOLD: 'text-live',
};

export function SellerDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    api
      .get('/items/mine')
      .then((res) => {
        offsetRef.current = res.serverNow - Date.now();
        setItems(res.items);
      })
      .catch(() => setItems([]));
  }, []);

  const verified = user?.sellerStatus === 'verified';
  const live = (items ?? []).filter((i) => i.status === 'ACTIVE').length;
  const sold = (items ?? []).filter((i) => i.status === 'SETTLED');
  const takings = sold.reduce((sum, i) => sum + (i.currentHighestBidCents ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-8">
        <div>
          <h1 className="display text-3xl text-ink sm:text-4xl">Selling</h1>
          <p className="mt-3 text-sm text-graphite">Your lots, and what they did.</p>
        </div>
        {verified && (
          <Button to="/selling/new">
            <PlusIcon size={14} />
            List an item
          </Button>
        )}
      </div>

      {!verified && (
        <div className="max-w-lg pb-8">
          <Banner tone="waiting">
            Your account is not a verified seller yet, so you can browse and bid but not list. Apply
            from{' '}
            <Link to="/settings" className="underline underline-offset-2">
              settings
            </Link>
            .
          </Banner>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-rule py-5">
          <Readout label="Listed" value={items.length} />
          <Readout label="Running now" value={live} />
          <Readout label="Sold" value={sold.length} tone={sold.length > 0 ? 'held' : 'ink'} />
          <Readout label="Taken" value={formatCents(takings)} />
        </div>
      )}

      <div className="pt-8">
        {items === null ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing listed yet."
            action={verified ? <Button to="/selling/new">List your first item</Button> : null}
          >
            {verified
              ? 'A lot needs a title, a condition, an asking price and a closing time.'
              : 'Once your seller application is approved, your lots appear here.'}
          </EmptyState>
        ) : (
          <div className="divide-y divide-rule border-t border-rule">
            {items.map((item) => (
              <SellerRow key={item.id} item={item} offsetRef={offsetRef} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SellerRow({ item, offsetRef }) {
  const remaining = useRemaining(item.endTime, offsetRef);
  const live = item.status === 'ACTIVE';

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden border border-rule bg-sunk">
        {item.images?.[0] && (
          <img src={item.images[0].thumbUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-48 flex-1">
        <Link
          to={`/lot/${item.id}`}
          className="display-sm text-base text-ink transition-colors hover:text-graphite"
        >
          {item.title}
        </Link>
        <p className={`text-xs ${STATUS_TONE[item.status] ?? 'text-graphite'}`}>
          {item.status.toLowerCase()}
          {item.status === 'UPCOMING' && ` · opens ${formatWhen(item.startTime)}`}
          {item.extensionCount > 0 && ` · extended ${item.extensionCount}×`}
        </p>
      </div>

      <div className="text-right">
        <p className="figures text-sm text-ink">
          {formatCents(item.currentHighestBidCents || item.startingPriceCents)}
        </p>
        <p className="text-xs text-graphite">
          {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
          {item.reservePriceCents > 0 && (item.reserveMet ? ' · reserve met' : ' · under reserve')}
        </p>
      </div>

      <div className="w-24 text-right">
        {live ? (
          <Countdown remaining={remaining} critical={remaining <= 60_000} size="sm" />
        ) : (
          <span className="text-xs text-graphite">—</span>
        )}
      </div>
    </div>
  );
}
