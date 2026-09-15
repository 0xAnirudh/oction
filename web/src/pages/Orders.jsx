import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents } from '../format.js';
import { Countdown, useRemaining } from '../components/Countdown.jsx';
import { Button, Field, inputClass, Banner } from '../components/ui.jsx';

const EMPTY = {
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
};

export function Orders() {
  const [orders, setOrders] = useState(null);
  const offsetRef = useRef(0);

  const load = () =>
    api.get('/orders/mine').then((res) => {
      offsetRef.current = res.serverNow - Date.now();
      setOrders(res.orders);
    });

  useEffect(() => {
    load();
  }, []);

  if (!orders) return <p className="py-16 text-sm text-graphite">Loading…</p>;

  if (orders.length === 0) {
    return (
      <div className="py-16">
        <h1 className="display text-3xl text-ink">Nothing won yet.</h1>
        <p className="mt-2 text-sm text-graphite">Lots you win appear here with a clock on them.</p>
        <Button to="/" variant="quiet" className="mt-6">
          Back to the catalogue
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="display text-4xl text-ink">Won</h1>
      <p className="mt-2 max-w-md text-sm text-graphite">
        A won lot is held for you while the clock runs. If it runs out the lot moves to the next
        bidder.
      </p>

      <div className="mt-10 space-y-12">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} offsetRef={offsetRef} onPaid={load} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order, offsetRef, onPaid }) {
  const [shipping, setShipping] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const remaining = useRemaining(order.expiresAt, offsetRef);

  const pending = order.status === 'PENDING' && remaining > 0;
  const set = (key) => (e) => setShipping((s) => ({ ...s, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/checkout`, { shipping });
      await onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="border-t border-rule pt-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 className="display text-2xl text-ink">
            {order.item ? (
              <Link to={`/lot/${order.item.id}`} className="hover:text-graphite">
                {order.item.title}
              </Link>
            ) : (
              'Lot'
            )}
          </h2>
          <p className="figures mt-1 text-sm text-ink">{formatCents(order.amountCents)}</p>
          {order.offerRank > 1 && (
            <p className="mt-1 text-xs text-graphite">
              Offered to you as the runner-up after the winner did not complete.
            </p>
          )}
        </div>

        {pending && (
          <div className="text-right">
            <p className="text-xs text-graphite">Hold expires in</p>
            <Countdown remaining={remaining} critical={remaining < 120_000} size="md" />
          </div>
        )}
      </div>

      <div className="mt-4">
        {order.status === 'PAID' && (
          <Banner tone="held">Paid. The seller has been notified.</Banner>
        )}
        {order.status === 'EXPIRED' && <Banner>The hold expired and the lot moved on.</Banner>}
        {order.status === 'CANCELLED' && <Banner>Cancelled.</Banner>}
        {order.status === 'PENDING' && remaining <= 0 && (
          <Banner tone="live">This hold has expired.</Banner>
        )}
      </div>

      {order.status === 'PAID' && <DisputePanel order={order} />}

      {pending && (
        <form onSubmit={submit} className="mt-6 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name" id={`name-${order.id}`}>
              <input
                id={`name-${order.id}`}
                className={inputClass}
                value={shipping.fullName}
                onChange={set('fullName')}
                required
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address" id={`line1-${order.id}`}>
              <input
                id={`line1-${order.id}`}
                className={inputClass}
                value={shipping.line1}
                onChange={set('line1')}
                required
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address line 2" id={`line2-${order.id}`} hint="Optional.">
              <input
                id={`line2-${order.id}`}
                className={inputClass}
                value={shipping.line2}
                onChange={set('line2')}
              />
            </Field>
          </div>
          <Field label="City" id={`city-${order.id}`}>
            <input
              id={`city-${order.id}`}
              className={inputClass}
              value={shipping.city}
              onChange={set('city')}
              required
            />
          </Field>
          <Field label="Region" id={`region-${order.id}`} hint="Optional.">
            <input
              id={`region-${order.id}`}
              className={inputClass}
              value={shipping.region}
              onChange={set('region')}
            />
          </Field>
          <Field label="Postcode" id={`postcode-${order.id}`}>
            <input
              id={`postcode-${order.id}`}
              className={inputClass}
              value={shipping.postcode}
              onChange={set('postcode')}
              required
            />
          </Field>
          <Field label="Country" id={`country-${order.id}`}>
            <input
              id={`country-${order.id}`}
              className={inputClass}
              value={shipping.country}
              onChange={set('country')}
              required
            />
          </Field>

          {error && <p className="text-sm text-live sm:col-span-2">{error}</p>}

          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">
              Pay {formatCents(order.amountCents)}
            </Button>
            <p className="mt-2 text-xs text-graphite">
              Checkout is simulated — no payment processor is wired in.
            </p>
          </div>
        </form>
      )}
    </article>
  );
}
