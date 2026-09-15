import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatWhen } from '../format.js';
import { Button, Banner, inputClass } from '../components/ui.jsx';

const TABS = [
  { key: 'sellers', label: 'Seller applications' },
  { key: 'disputes', label: 'Disputes' },
];

export function Admin() {
  const [tab, setTab] = useState('sellers');
  const [overview, setOverview] = useState(null);
  const [denied, setDenied] = useState(false);

  const loadOverview = useCallback(
    () =>
      api
        .get('/admin/overview')
        .then(setOverview)
        .catch(() => setDenied(true)),
    [],
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (denied) {
    return (
      <div className="py-16">
        <h1 className="display text-3xl text-ink">No such page.</h1>
        <Button to="/" variant="quiet" className="mt-6">
          Back to the catalogue
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-rule pb-6">
        <h1 className="display text-4xl text-ink">Staff</h1>
        {overview && (
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            {[
              ['Live lots', overview.liveItems],
              ['Applications', overview.pendingSellers],
              ['Open disputes', overview.openDisputes],
              ['Awaiting payment', overview.pendingOrders],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-graphite">{label}</dt>
                <dd className="figures display text-2xl text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex gap-6 py-5">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`text-sm transition-colors ${
              tab === entry.key ? 'text-ink' : 'text-graphite hover:text-ink'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'sellers' ? (
        <Sellers onChange={loadOverview} />
      ) : (
        <Disputes onChange={loadOverview} />
      )}
    </div>
  );
}

function Sellers({ onChange }) {
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(
    () => api.get('/admin/sellers?status=pending').then((r) => setUsers(r.users)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function decide(id, decision) {
    setBusy(id);
    try {
      await api.post(`/admin/sellers/${id}/${decision}`, {});
      await Promise.all([load(), onChange()]);
    } finally {
      setBusy(null);
    }
  }

  if (users === null) return <p className="py-10 text-sm text-graphite">Loading…</p>;
  if (users.length === 0)
    return <p className="py-10 text-sm text-graphite">No applications waiting.</p>;

  return (
    <div className="divide-y divide-rule border-t border-rule">
      {users.map((user) => (
        <div key={user.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="min-w-48 flex-1">
            <p className="text-sm text-ink">{user.displayName}</p>
            <p className="text-xs text-graphite">
              {user.email}
              {!user.emailVerified && <span className="text-live"> · unconfirmed address</span>}
            </p>
          </div>
          <p className="text-xs text-graphite">applied {formatWhen(user.appliedAt)}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy === user.id || !user.emailVerified}
              onClick={() => decide(user.id, 'verify')}
            >
              Verify
            </Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={busy === user.id}
              onClick={() => decide(user.id, 'reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const REASON_COPY = {
  not_received: 'Never arrived',
  not_as_described: 'Not as described',
  damaged: 'Damaged',
  other: 'Other',
};

function Disputes({ onChange }) {
  const [disputes, setDisputes] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(
    () => api.get('/admin/disputes').then((r) => setDisputes(r.disputes)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id, outcome) {
    const resolution = (notes[id] ?? '').trim();
    if (!resolution) return;
    setBusy(id);
    try {
      await api.post(`/admin/disputes/${id}/resolve`, { outcome, resolution });
      await Promise.all([load(), onChange()]);
    } finally {
      setBusy(null);
    }
  }

  if (disputes === null) return <p className="py-10 text-sm text-graphite">Loading…</p>;
  if (disputes.length === 0) return <p className="py-10 text-sm text-graphite">Nothing open.</p>;

  return (
    <div className="divide-y divide-rule border-t border-rule">
      {disputes.map((dispute) => (
        <article key={dispute.id} className="py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="display text-lg text-ink">
              {dispute.item ? (
                <Link to={`/lot/${dispute.item.id}`} className="hover:text-graphite">
                  {dispute.item.title}
                </Link>
              ) : (
                'Lot withdrawn'
              )}
            </h3>
            <p className="text-xs text-graphite">
              {REASON_COPY[dispute.reason] ?? dispute.reason} · opened{' '}
              {formatWhen(dispute.createdAt)}
            </p>
          </div>

          {dispute.detail && (
            <p className="mt-2 max-w-prose text-sm text-graphite">{dispute.detail}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-sm`}
              placeholder="What was decided, and why"
              value={notes[dispute.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [dispute.id]: e.target.value }))}
              aria-label="Resolution"
            />
            <Button
              size="sm"
              disabled={busy === dispute.id || !(notes[dispute.id] ?? '').trim()}
              onClick={() => resolve(dispute.id, 'buyer')}
            >
              For the buyer
            </Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={busy === dispute.id || !(notes[dispute.id] ?? '').trim()}
              onClick={() => resolve(dispute.id, 'seller')}
            >
              For the seller
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
