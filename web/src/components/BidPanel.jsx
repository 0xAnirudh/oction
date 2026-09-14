import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, parseAmount } from '../format.js';
import { Button, Banner, inputClass } from './ui.jsx';

// The rail. One obvious action - bid the minimum - with the option to
// type a larger number for anyone who wants to skip a few rungs.
export function BidPanel({ item, user, onBid, critical, closed }) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const minimum = item.nextMinimumCents;
  const leading = user && item.currentWinner === user.id;
  const outbid = user && !leading && item.yourBids > 0;
  const isSeller = user && item.sellerId === user.id;

  useEffect(() => setError(null), [item.currentHighestBidCents]);

  async function submit(amountCents) {
    setBusy(true);
    setError(null);
    try {
      await onBid(amountCents);
      setCustom('');
      setShowCustom(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submitCustom(event) {
    event.preventDefault();
    const cents = parseAmount(custom);
    if (cents === null) return setError('Enter an amount like 245.00');
    if (cents < minimum) return setError(`The minimum is ${formatCents(minimum)}`);
    return submit(cents);
  }

  return (
    <div
      className={`border-t-2 pt-5 transition-colors duration-500 ${
        critical ? 'border-live' : 'border-ink'
      }`}
    >
      <p className="text-xs text-graphite">
        {item.bidCount > 0
          ? `${item.bidCount} ${item.bidCount === 1 ? 'bid' : 'bids'} · current`
          : 'Asking'}
      </p>
      <p className="display figures mt-1 text-4xl text-ink">
        {formatCents(item.currentHighestBidCents || item.startingPriceCents)}
      </p>

      <div className="mt-4 space-y-2">
        {item.hasReserve && !item.reserveMet && <Banner>Reserve not yet met.</Banner>}
        {leading && <Banner tone="held">You hold this lot.</Banner>}
        {outbid && <Banner tone="live">You have been outbid.</Banner>}
        {critical && !closed && (
          <Banner tone="live">Final seconds — a bid now pushes the close out.</Banner>
        )}
      </div>

      {closed ? (
        <p className="mt-5 text-sm text-graphite">Bidding has closed on this lot.</p>
      ) : !user ? (
        <div className="mt-5">
          <Button to="/sign-in" size="lg" className="w-full">
            Sign in to bid
          </Button>
        </div>
      ) : isSeller ? (
        <p className="mt-5 text-sm text-graphite">This is your lot. You cannot bid on it.</p>
      ) : (
        <div className="mt-5 space-y-3">
          <Button
            size="lg"
            variant={critical ? 'live' : 'primary'}
            className="w-full"
            disabled={busy || leading}
            onClick={() => submit(minimum)}
          >
            {leading ? 'You are the highest bidder' : `Bid ${formatCents(minimum)}`}
          </Button>

          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="text-sm text-graphite underline-offset-4 hover:text-ink hover:underline"
            >
              Bid a different amount
            </button>
          ) : (
            <form onSubmit={submitCustom} className="flex gap-2">
              <input
                className={inputClass}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={(minimum / 100).toFixed(2)}
                inputMode="decimal"
                aria-label="Bid amount"
                autoFocus
              />
              <Button type="submit" disabled={busy}>
                Bid
              </Button>
            </form>
          )}

          {error && <p className="text-sm text-live">{error}</p>}
          <p className="text-xs text-graphite">
            Bids are binding. The next rung is {formatCents(minimum)}.
          </p>
        </div>
      )}
    </div>
  );
}
