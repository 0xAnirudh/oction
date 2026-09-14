import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatCents, formatWhen } from '../format.js';
import { Countdown, useRemaining } from '../components/Countdown.jsx';
import { Button, Banner } from '../components/ui.jsx';

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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <h1 className="display text-4xl text-ink">Selling</h1>
          <p className="mt-2 text-sm text-graphite">Your lots, and what they did.</p>
        </div>
        {verified && <Button to="/selling/new">List an item</Button>}
      </div>

      {!verified && (
        <div className="mt-8 max-w-lg">
          <Banner>
            Your account is not a verified seller yet, so you can browse and bid but not list. In a
            real deployment that verification is a human decision somebody makes in the admin tools.
          </Banner>
        </div>
      )}

      {items === null ? (
        <p className="py-16 text-sm text-graphite">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-sm text-graphite">You have not listed anything yet.</p>
      ) : (
        <div className="mt-8 divide-y divide-rule border-t border-rule">
          {items.map((item) => (
            <SellerRow key={item.id} item={item} offsetRef={offsetRef} />
          ))}
        </div>
      )}
    </div>
  );
}

function SellerRow({ item, offsetRef }) {
  const remaining = useRemaining(item.endTime, offsetRef);
  const live = item.status === 'ACTIVE';

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
      <div className="h-16 w-16 shrink-0 overflow-hidden border border-rule bg-raised">
        {item.images?.[0] ? (
          <img src={item.images[0].thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-48 flex-1">
        <Link to={`/lot/${item.id}`} className="display text-lg text-ink hover:text-graphite">
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
          {item.currentHighestBidCents > 0
            ? formatCents(item.currentHighestBidCents)
            : formatCents(item.startingPriceCents)}
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
