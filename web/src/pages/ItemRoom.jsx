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
import { SpecRow, Button } from '../components/ui.jsx';

const CLOSED = new Set(['ENDED', 'SETTLED', 'UNSOLD']);

export function ItemRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [bids, setBids] = useState([]);
  const [watchers, setWatchers] = useState(0);
  const [arrivedSeq, setArrivedSeq] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    let live = true;
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
      if (state?.error) return;
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
      // The socket will deliver the same event to everyone including us,
      // but the bidder should not wait a round trip to see their own bid
      // land.
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
      <div className="py-16">
        <p className="display text-2xl text-ink">That lot is not here.</p>
        <p className="mt-2 text-sm text-graphite">{error}</p>
        <Button to="/" variant="quiet" className="mt-6">
          Back to the catalogue
        </Button>
      </div>
    );
  }

  if (!item) return <p className="py-16 text-sm text-graphite">Opening the room…</p>;

  const youWon = outcome?.buyerId && user && outcome.buyerId === user.id;

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1fr_22rem]">
      <div>
        <Carousel images={item.images} title={item.title} />

        <h1 className="display mt-8 text-4xl leading-tight text-ink sm:text-5xl">{item.title}</h1>
        {item.description && (
          <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-graphite">
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
            <SpecRow label="Reserve">{item.reserveMet ? 'Met' : 'Not met'}</SpecRow>
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

        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <h2 className="display text-xl text-ink">Bidding</h2>
            <Link to={`/lot/${id}/audit`} className="text-xs text-graphite hover:text-ink">
              Full log
            </Link>
          </div>
          <BidLog bids={bids.slice(0, 40)} youId={user?.id} arrivedSeq={arrivedSeq} />
        </section>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div
          className={`mb-5 flex items-baseline justify-between ${critical ? 'critical-rule' : ''}`}
        >
          <div>
            <p className="text-xs text-graphite">{closed ? 'Closed' : 'Time remaining'}</p>
            <Countdown remaining={remaining} critical={critical} size="lg" />
          </div>
          {watchers > 0 && <p className="figures text-xs text-graphite">{watchers} watching</p>}
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
          <p className="mt-5 text-sm text-graphite">This lot did not sell.</p>
        )}
      </aside>
    </div>
  );
}
