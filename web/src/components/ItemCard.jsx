import { Link } from 'react-router-dom';
import { formatCents } from '../format.js';
import { useRemaining, Countdown } from './Countdown.jsx';

// A catalogue entry: plate, title, then the two facts that matter -
// what it stands at and how long is left.
export function ItemCard({ item, offsetRef }) {
  const remaining = useRemaining(item.endTime, offsetRef);
  const critical = remaining > 0 && remaining <= 60_000;
  const image = item.images?.[0];

  return (
    <Link to={`/lot/${item.id}`} className="group block">
      <div className="aspect-4/3 overflow-hidden border border-rule bg-raised">
        {image ? (
          <img
            src={image.thumbUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-graphite">No photograph</div>
        )}
      </div>

      <h3 className="display mt-3 text-lg leading-snug text-ink">{item.title}</h3>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="figures text-sm text-ink">
          {item.currentHighestBidCents > 0
            ? formatCents(item.currentHighestBidCents)
            : formatCents(item.startingPriceCents)}
          <span className="ml-1.5 text-xs text-graphite">
            {item.currentHighestBidCents > 0 ? `· ${item.bidCount} bids` : 'to open'}
          </span>
        </span>
        <Countdown remaining={remaining} critical={critical} size="sm" />
      </div>

      <p className="mt-1 text-xs text-graphite">
        {item.condition}
        {item.hasReserve && !item.reserveMet && ' · reserve not met'}
      </p>
    </Link>
  );
}
