import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents } from '../format.js';
import { Countdown, useRemaining } from '../components/Countdown.jsx';
import { Button, Field, inputClass, Banner, EmptyState, RowSkeleton } from '../components/ui.jsx';

const EMPTY = {
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
};

const DISPUTE_REASONS = [
  { value: 'not_received', label: 'It never arrived' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'damaged', label: 'It arrived damaged' },
  { value: 'other', label: 'Something else' },
];

export function Orders() {
  const [orders, setOrders] = useState(null);
  const offsetRef = useRef(0);

  const load = useCallback(
    () =>
      api
        .get('/orders/mine')
        .then((res) => {
          offsetRef.current = res.serverNow - Date.now();
          setOrders(res.orders);
        })
        .catch(() => setOrders([])),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (orders === null) {
    return (
      <div className="space-y-4">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState title="Nothing won yet." action={<Button to="/">Back to the catalogue</Button>}>
        Lots you win appear here with a clock on them. Miss the clock and the lot goes to the next
        bidder, so it is worth watching.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="pb-8">
        <h1 className="display text-3xl text-ink sm:text-4xl">Won</h1>
        <p className="measure mt-3 text-sm text-graphite">
          A won lot is held for you while the clock runs. If it runs out, it is offered to the next
          bidder at their own bid.
        </p>
      </div>

      <div className="space-y-10">
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
  const urgent = pending && remaining < 120_000;
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
      setBusy(false);
    }
  }

  return (
    <article className="border-t border-rule pt-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="display-sm text-xl text-ink">
            {order.item ? (
              <Link to={`/lot/${order.item.id}`} className="transition-colors hover:text-graphite">
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
            <Countdown remaining={remaining} critical={urgent} size="md" />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
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
          <Field label="Full name" id={`name-${order.id}`} className="sm:col-span-2">
            <input
              id={`name-${order.id}`}
              className={inputClass}
              value={shipping.fullName}
              onChange={set('fullName')}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Address" id={`line1-${order.id}`} className="sm:col-span-2">
            <input
              id={`line1-${order.id}`}
              className={inputClass}
              value={shipping.line1}
              onChange={set('line1')}
              autoComplete="address-line1"
              required
            />
          </Field>
          <Field
            label="Address line 2"
            id={`line2-${order.id}`}
            hint="Optional."
            className="sm:col-span-2"
          >
            <input
              id={`line2-${order.id}`}
              className={inputClass}
              value={shipping.line2}
              onChange={set('line2')}
              autoComplete="address-line2"
            />
          </Field>
          <Field label="City" id={`city-${order.id}`}>
            <input
              id={`city-${order.id}`}
              className={inputClass}
              value={shipping.city}
              onChange={set('city')}
              autoComplete="address-level2"
              required
            />
          </Field>
          <Field label="Region" id={`region-${order.id}`} hint="Optional.">
            <input
              id={`region-${order.id}`}
              className={inputClass}
              value={shipping.region}
              onChange={set('region')}
              autoComplete="address-level1"
            />
          </Field>
          <Field label="Postcode" id={`postcode-${order.id}`}>
            <input
              id={`postcode-${order.id}`}
              className={inputClass}
              value={shipping.postcode}
              onChange={set('postcode')}
              autoComplete="postal-code"
              required
            />
          </Field>
          <Field label="Country" id={`country-${order.id}`} error={error}>
            <input
              id={`country-${order.id}`}
              className={inputClass}
              value={shipping.country}
              onChange={set('country')}
              autoComplete="country-name"
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" size="lg" busy={busy} className="w-full sm:w-auto">
              Pay {formatCents(order.amountCents)}
            </Button>
            <p className="mt-2 text-xs text-graphite">
              Checkout is simulated — no payment processor is wired in, and no card is asked for.
            </p>
          </div>
        </form>
      )}
    </article>
  );
}

// Only on a paid order. Until money has moved there is nothing to
// dispute - an unpaid one simply expires and the lot rolls down.
function DisputePanel({ order }) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState(undefined);
  const [form, setForm] = useState({ reason: 'not_as_described', detail: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/orders/${order.id}/dispute`)
      .then((res) => setExisting(res.dispute))
      .catch(() => setExisting(null));
  }, [order.id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/orders/${order.id}/dispute`, form);
      setExisting(res.dispute);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (existing === undefined) return null;

  if (existing) {
    const resolved = existing.status !== 'OPEN';
    return (
      <div className="mt-4">
        <Banner tone={resolved ? 'held' : 'waiting'}>
          {resolved
            ? `Dispute closed: ${existing.resolution}`
            : 'Dispute open. Somebody is looking at it.'}
        </Banner>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-xs text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Report a problem with this order
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rise mt-4 max-w-md space-y-4">
      <Field label="What went wrong" id={`reason-${order.id}`}>
        <select
          id={`reason-${order.id}`}
          className={inputClass}
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
        >
          {DISPUTE_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Details"
        id={`detail-${order.id}`}
        hint="What you received, and what you expected."
        error={error}
      >
        <textarea
          id={`detail-${order.id}`}
          rows={3}
          className={inputClass}
          value={form.detail}
          onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
          maxLength={4000}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" size="sm" busy={busy}>
          Open a dispute
        </Button>
        <Button type="button" size="sm" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
