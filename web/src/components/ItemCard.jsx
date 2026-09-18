import { Link } from 'react-router-dom';
import { formatCents } from '../format.js';
import { useRemaining, Countdown } from './Countdown.jsx';

// A catalogue entry: plate, title, then the two facts that decide
// whether you click - what it stands at, and how long is left.
export function ItemCard({ item, offsetRef }) {
  const remaining = useRemaining(item.endTime, offsetRef);
  const closed = ['ENDED', 'SETTLED', 'UNSOLD'].includes(item.status);
  const critical = !closed && remaining > 0 && remaining <= 60_000;
  const image = item.images?.[0];
  const open = item.currentHighestBidCents > 0;

  return (
    <Link
      to={`/lot/${item.id}`}
      className="group block focus-visible:outline-none"
      aria-label={`${item.title}, ${formatCents(open ? item.currentHighestBidCents : item.startingPriceCents)}`}
    >
      <div className="relative aspect-4/3 overflow-hidden border border-rule bg-sunk transition-colors duration-300 group-hover:border-rule-strong group-focus-visible:border-ink">
        {image ? (
          <img
            src={image.thumbUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.04]"
            style={{ transitionTimingFunction: 'var(--ease)' }}
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-graphite">No photograph</div>
        )}

        {critical && (
          <div className="absolute inset-x-0 bottom-0 bg-live px-2.5 py-1 text-2xs font-medium tracking-wide text-white">
            Closing
          </div>
        )}
        {closed && (
          <div className="absolute inset-0 grid place-items-center bg-paper/70">
            <span className="text-xs text-graphite">
              {item.status === 'UNSOLD' ? 'Unsold' : 'Closed'}
            </span>
          </div>
        )}
      </div>

      <h3 className="display-sm mt-3 text-lg text-ink transition-colors duration-200 group-hover:text-ink-soft">
        {item.title}
      </h3>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="figures text-sm text-ink">
          {formatCents(open ? item.currentHighestBidCents : item.startingPriceCents)}
          <span className="ml-1.5 text-xs text-graphite">
            {open ? `${item.bidCount} ${item.bidCount === 1 ? 'bid' : 'bids'}` : 'to open'}
          </span>
        </span>
        {!closed && <Countdown remaining={remaining} critical={critical} size="sm" />}
      </div>

      <p className="mt-1 text-xs text-graphite">
        {item.condition}
        {item.hasReserve && !item.reserveMet && ' · reserve not met'}
      </p>
    </Link>
  );
}
