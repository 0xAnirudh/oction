import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth } from '../auth.jsx';
import { formatCents, formatWhen } from '../format.js';
import { Carousel } from '../components/Carousel.jsx';
import { BidPanel } from '../components/BidPanel.jsx';
import { BidLog } from '../components/BidLog.jsx';
import { Countdown, useRemaining } from '../components/Countdown.jsx';
import { WatchButton } from '../components/WatchButton.jsx';
import { ReportDialog } from '../components/ReportDialog.jsx';
import { Button, SpecRow, Skeleton, Banner } from '../components/ui.jsx';
import { EyeIcon, FlagIcon } from '../components/icons.jsx';

const CLOSED = new Set(['ENDED', 'SETTLED', 'UNSOLD']);

export function ItemRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [bids, setBids] = useState([]);
  const [watchers, setWatchers] = useState(0);
  const [arrivedSeq, setArrivedSeq] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    let live = true;
    setItem(null);
    Promise.all([api.get(`/items/${id}`), api.get(`/items/${id}/bids`)])
      .then(([itemRes, bidRes]) => {
        if (!live) return;
        offsetRef.current = itemRes.serverNow - Date.now();
        setItem(itemRes.item);
        setBids(bidRes.bids);
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [id]);

  // One room, joined on arrival and left on the way out. Everything the
  // page shows after this point arrives over the socket rather than by
  // polling - a price that updates on a five second timer is a price
  // people bid against wrongly.
  useEffect(() => {
    const socket = getSocket();

    const onJoin = (state) => {
      if (!state || state.error) return;
      offsetRef.current = state.serverNow - Date.now();
      setItem((prev) => (prev ? { ...prev, ...state, images: state.media ?? prev.images } : prev));
    };

    const join = () => socket.emit('room:join', { itemId: id }, onJoin);
    join();
    socket.on('connect', join);

    const onBid = (event) => {
      if (event.itemId !== id) return;
      setItem((prev) =>
        prev
          ? {
              ...prev,
              currentHighestBidCents: event.amountCents,
              currentWinner: event.bidderId,
              bidCount: event.bidCount,
              nextMinimumCents: event.nextMinimumCents,
              endTime: event.endTime,
            }
          : prev,
      );
      setBids((prev) => (prev.some((b) => b.seq === event.seq) ? prev : [event, ...prev]));
      setArrivedSeq(event.seq);
    };

    const onExtended = (event) => {
      if (event.itemId !== id) return;
      setItem((prev) => (prev ? { ...prev, endTime: event.endTime } : prev));
    };

    const onEnded = (event) => {
      if (event.itemId !== id) return;
      setItem((prev) => (prev ? { ...prev, status: 'ENDED' } : prev));
      if (event.buyerId) setOutcome(event);
    };

    const onSettled = (event) => {
      if (event.itemId !== id) return;
      setItem((prev) => (prev ? { ...prev, status: event.status } : prev));
    };

    const onPresence = (event) => event.itemId === id && setWatchers(event.watchers);

    socket.on('BID_ACCEPTED', onBid);
    socket.on('TIMER_EXTENDED', onExtended);
    socket.on('AUCTION_ENDED', onEnded);
    socket.on('CHECKOUT_ROLLED', onEnded);
    socket.on('ITEM_SETTLED', onSettled);
    socket.on('ROOM_PRESENCE', onPresence);

    return () => {
      socket.emit('room:leave', { itemId: id });
      socket.off('connect', join);
      socket.off('BID_ACCEPTED', onBid);
      socket.off('TIMER_EXTENDED', onExtended);
      socket.off('AUCTION_ENDED', onEnded);
      socket.off('CHECKOUT_ROLLED', onEnded);
      socket.off('ITEM_SETTLED', onSettled);
      socket.off('ROOM_PRESENCE', onPresence);
    };
  }, [id]);

  const remaining = useRemaining(item?.endTime, offsetRef);
  const closed = item ? CLOSED.has(item.status) || remaining <= 0 : false;
  const critical = !closed && remaining > 0 && remaining <= (item?.softCloseWindowMs ?? 15_000);

  const yourBids = useMemo(
    () => (user ? bids.filter((b) => b.bidderId === user.id).length : 0),
    [bids, user],
  );

  const placeBid = useCallback(
    async (amountCents) => {
      const res = await api.post(`/items/${id}/bids`, { amountCents });
      // The socket delivers the same event to everyone including us,
      // but the bidder should not wait a round trip to see their own
      // bid land.
      setItem((prev) =>
        prev
          ? {
              ...prev,
              currentHighestBidCents: res.currentHighestBidCents,
              nextMinimumCents: res.nextMinimumCents,
              bidCount: res.bidCount,
              endTime: res.endTime,
              currentWinner: user.id,
            }
          : prev,
      );
      return res;
    },
    [id, user],
  );

  if (error) {
    return (
      <div className="py-20">
        <p className="display text-2xl text-ink">That lot is not here.</p>
        <p className="mt-2 text-sm text-graphite">{error}</p>
        <Button to="/" variant="quiet" className="mt-6">
          Back to the catalogue
        </Button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="grid grid-cols-1 gap-x-12 gap-y-10 pb-24 lg:grid-cols-[1fr_21rem] lg:pb-0">
        <div className="space-y-6">
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-16 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const youWon = outcome?.buyerId && user && outcome.buyerId === user.id;

  return (
    <>
      {/* The one authored moment: crossing into the window where a bid
          moves the close changes the temperature of the whole page,
          rather than adding a badge to a corner of it. */}
      {critical && (
        <div className="breathing fixed inset-x-0 top-0 z-40 h-0.5 bg-live" aria-hidden="true" />
      )}

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 pb-24 lg:grid-cols-[1fr_21rem] lg:pb-0">
        <div className="min-w-0">
          <Carousel images={item.images} title={item.title} />

          <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <h1 className="display max-w-2xl text-3xl leading-tight text-ink sm:text-4xl">
              {item.title}
            </h1>
            {user && (
              <div className="flex items-center gap-2">
                <WatchButton
                  itemId={item.id}
                  watching={item.watching}
                  onChange={(watching) => setItem((prev) => (prev ? { ...prev, watching } : prev))}
                />
                {item.sellerId !== user.id && (
                  <button
                    type="button"
                    onClick={() => setReporting(true)}
                    className="inline-flex items-center gap-1.5 border border-rule px-2.5 py-1.5 text-sm text-graphite transition-colors hover:border-live hover:text-live"
                  >
                    <FlagIcon size={14} />
                    Report
                  </button>
                )}
              </div>
            )}
          </div>

          {item.description && (
            <p className="measure mt-4 text-base leading-relaxed text-ink-soft">
              {item.description}
            </p>
          )}

          <dl className="mt-8 max-w-md">
            <SpecRow label="Condition">{item.condition}</SpecRow>
            <SpecRow label="Opened at">{formatCents(item.startingPriceCents)}</SpecRow>
            {item.bidIncrementCents && (
              <SpecRow label="Increment">{formatCents(item.bidIncrementCents)}</SpecRow>
            )}
            {item.hasReserve && (
              <SpecRow label="Reserve">
                <span className={item.reserveMet ? 'text-held' : 'text-graphite'}>
                  {item.reserveMet ? 'Met' : 'Not met'}
                </span>
              </SpecRow>
            )}
            {item.shippingDetails?.shipsFrom && (
              <SpecRow label="Ships from">{item.shippingDetails.shipsFrom}</SpecRow>
            )}
            {item.shippingDetails?.weightKg && (
              <SpecRow label="Weight">{item.shippingDetails.weightKg} kg</SpecRow>
            )}
            <SpecRow label="Closes">{formatWhen(item.endTime)}</SpecRow>
            {item.extensionCount > 0 && (
              <SpecRow label="Extended">
                {item.extensionCount} {item.extensionCount === 1 ? 'time' : 'times'}
              </SpecRow>
            )}
          </dl>

          <section className="mt-14">
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <h2 className="display-sm text-lg text-ink">Bidding</h2>
              <Link
                to={`/lot/${id}/audit`}
                className="text-xs text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Full log
              </Link>
            </div>
            <BidLog bids={bids.slice(0, 40)} youId={user?.id} arrivedSeq={arrivedSeq} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-graphite">{closed ? 'Closed' : 'Time remaining'}</p>
              {watchers > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-graphite">
                  <EyeIcon size={13} />
                  <span className="figures">{watchers}</span>
                </p>
              )}
            </div>
            <Countdown remaining={remaining} critical={critical} size="lg" className="mt-1" />
          </div>

          {youWon ? (
            <div className="border-t-2 border-held pt-5">
              <p className="display text-2xl text-held">You won this lot.</p>
              <p className="mt-2 text-sm text-graphite">
                {formatCents(outcome.amountCents)} — confirm your address and pay before the hold
                expires.
              </p>
              <Button to="/orders" size="lg" className="mt-5 w-full">
                Complete checkout
              </Button>
            </div>
          ) : (
            <BidPanel
              item={{ ...item, yourBids }}
              user={user}
              onBid={placeBid}
              critical={critical}
              closed={closed}
            />
          )}

          {closed && item.status === 'UNSOLD' && (
            <div className="mt-5">
              <Banner>This lot did not sell.</Banner>
            </div>
          )}
        </aside>
      </div>

      {/* On a phone the rail is a screen and a half below the fold, so
          the two things that matter - what it stands at and how long is
          left - come back to the thumb. Hidden the moment there is room
          for the rail proper. */}
      {!closed && !youWon && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 backdrop-blur-sm lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <Countdown remaining={remaining} critical={critical} size="md" />
              <p className="figures truncate text-xs text-graphite">
                {formatCents(item.currentHighestBidCents || item.startingPriceCents)}
                {item.bidCount > 0 && ` · ${item.bidCount} bids`}
              </p>
            </div>
            {user && item.sellerId !== user.id && (
              <Button
                variant={critical ? 'live' : 'primary'}
                disabled={item.currentWinner === user.id}
                onClick={() => placeBid(item.nextMinimumCents).catch(() => {})}
              >
                {item.currentWinner === user.id
                  ? 'You lead'
                  : `Bid ${formatCents(item.nextMinimumCents)}`}
              </Button>
            )}
            {!user && <Button to="/sign-in">Sign in to bid</Button>}
          </div>
        </div>
      )}

      <ReportDialog itemId={item.id} open={reporting} onClose={() => setReporting(false)} />
    </>
  );
}
