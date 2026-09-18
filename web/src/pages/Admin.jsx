import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatWhen } from '../format.js';
import {
  Button,
  Banner,
  EmptyState,
  Readout,
  RowSkeleton,
  Tabs,
  inputClass,
} from '../components/ui.jsx';
import { AlertIcon } from '../components/icons.jsx';

const TABS = [
  { key: 'sellers', label: 'Applications' },
  { key: 'reports', label: 'Reported lots' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'integrity', label: 'Integrity' },
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
      <EmptyState title="No such page." action={<Button to="/">Back to the catalogue</Button>} />
    );
  }

  const Panel = { sellers: Sellers, reports: Reports, disputes: Disputes, integrity: Integrity }[
    tab
  ];

  return (
    <div>
      <div className="pb-8">
        <h1 className="display text-3xl text-ink sm:text-4xl">Staff</h1>
        {overview && (
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
            <Readout label="Live lots" value={overview.liveItems} />
            <Readout
              label="Applications"
              value={overview.pendingSellers}
              tone={overview.pendingSellers > 0 ? 'live' : 'ink'}
            />
            <Readout
              label="Reported lots"
              value={overview.openReports ?? 0}
              tone={overview.openReports > 0 ? 'live' : 'ink'}
            />
            <Readout
              label="Open disputes"
              value={overview.openDisputes}
              tone={overview.openDisputes > 0 ? 'live' : 'ink'}
            />
            <Readout label="Awaiting payment" value={overview.pendingOrders} />
          </div>
        )}
      </div>

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={{
          sellers: overview?.pendingSellers ?? 0,
          reports: overview?.openReports ?? 0,
          disputes: overview?.openDisputes ?? 0,
        }}
      />

      <div className="pt-6">
        <Panel onChange={loadOverview} />
      </div>
    </div>
  );
}

function useQueue(path) {
  const [data, setData] = useState(null);
  const load = useCallback(
    () =>
      api
        .get(path)
        .then(setData)
        .catch(() => setData({})),
    [path],
  );
  useEffect(() => {
    load();
  }, [load]);
  return [data, load];
}

function Loading() {
  return (
    <>
      <RowSkeleton />
      <RowSkeleton />
    </>
  );
}

/* ---------------------------------------------------------------- */

function Sellers({ onChange }) {
  const [data, load] = useQueue('/admin/sellers?status=pending');
  const [busy, setBusy] = useState(null);

  async function decide(id, decision) {
    setBusy(id);
    try {
      await api.post(`/admin/sellers/${id}/${decision}`, {});
      await Promise.all([load(), onChange()]);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <Loading />;
  const users = data.users ?? [];
  if (users.length === 0)
    return <EmptyState title="No applications waiting.">Nothing to decide right now.</EmptyState>;

  return (
    <div className="divide-y divide-rule border-t border-rule">
      {users.map((user) => (
        <div key={user.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="min-w-48 flex-1">
            <p className="text-sm text-ink">{user.displayName}</p>
            <p className="text-xs text-graphite">
              {user.email}
              {!user.emailVerified && <span className="ml-2 text-live">unconfirmed address</span>}
            </p>
          </div>
          <p className="text-xs text-graphite">applied {formatWhen(user.appliedAt)}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              busy={busy === user.id}
              disabled={!user.emailVerified}
              onClick={() => decide(user.id, 'verify')}
            >
              Verify
            </Button>
            <Button size="sm" variant="quiet" onClick={() => decide(user.id, 'reject')}>
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const REPORT_COPY = {
  prohibited_item: 'Should not be sold here',
  counterfeit: 'Counterfeit',
  misleading_description: 'Misleading description',
  stolen_goods: 'Possibly stolen',
  offensive_content: 'Offensive',
  other: 'Other',
};

function Reports({ onChange }) {
  const [data, load] = useQueue('/admin/reports');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  async function resolve(id, outcome, withdrawItem) {
    setBusy(id);
    try {
      await api.post(`/admin/reports/${id}/resolve`, {
        outcome,
        note: (notes[id] ?? '').trim(),
        withdrawItem,
      });
      await Promise.all([load(), onChange()]);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <Loading />;
  const reports = data.reports ?? [];
  if (reports.length === 0)
    return <EmptyState title="Nothing reported.">The catalogue is clean, for now.</EmptyState>;

  return (
    <div className="divide-y divide-rule border-t border-rule">
      {reports.map((report) => (
        <article key={report.id} className="py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="display-sm text-lg text-ink">
              {report.item ? (
                <Link
                  to={`/lot/${report.item.id}`}
                  className="transition-colors hover:text-graphite"
                >
                  {report.item.title}
                </Link>
              ) : (
                'Lot no longer listed'
              )}
            </h3>
            <p className="flex items-center gap-2 text-xs text-graphite">
              {report.reportsOnThisItem > 1 && (
                <span className="flex items-center gap-1 text-live">
                  <AlertIcon size={12} />
                  {report.reportsOnThisItem} reports
                </span>
              )}
              {REPORT_COPY[report.reason] ?? report.reason} · {formatWhen(report.createdAt)}
            </p>
          </div>

          {report.detail && <p className="measure mt-2 text-sm text-graphite">{report.detail}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-xs`}
              placeholder="What was decided, and why"
              value={notes[report.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [report.id]: e.target.value }))}
              aria-label="Decision note"
            />
            <Button
              size="sm"
              variant="danger"
              busy={busy === report.id}
              onClick={() => resolve(report.id, 'uphold', true)}
            >
              Uphold and withdraw
            </Button>
            <Button size="sm" variant="quiet" onClick={() => resolve(report.id, 'uphold', false)}>
              Uphold only
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resolve(report.id, 'dismiss', false)}>
              Dismiss
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const DISPUTE_COPY = {
  not_received: 'Never arrived',
  not_as_described: 'Not as described',
  damaged: 'Damaged',
  other: 'Other',
};

function Disputes({ onChange }) {
  const [data, load] = useQueue('/admin/disputes');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

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

  if (!data) return <Loading />;
  const disputes = data.disputes ?? [];
  if (disputes.length === 0)
    return (
      <EmptyState title="Nothing open.">No buyer is currently unhappy enough to file.</EmptyState>
    );

  return (
    <div className="divide-y divide-rule border-t border-rule">
      {disputes.map((dispute) => (
        <article key={dispute.id} className="py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="display-sm text-lg text-ink">
              {dispute.item ? (
                <Link
                  to={`/lot/${dispute.item.id}`}
                  className="transition-colors hover:text-graphite"
                >
                  {dispute.item.title}
                </Link>
              ) : (
                'Lot withdrawn'
              )}
            </h3>
            <p className="text-xs text-graphite">
              {DISPUTE_COPY[dispute.reason] ?? dispute.reason} · opened{' '}
              {formatWhen(dispute.createdAt)}
            </p>
          </div>

          {dispute.detail && <p className="measure mt-2 text-sm text-graphite">{dispute.detail}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-xs`}
              placeholder="What was decided, and why"
              value={notes[dispute.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [dispute.id]: e.target.value }))}
              aria-label="Resolution"
            />
            <Button
              size="sm"
              busy={busy === dispute.id}
              disabled={!(notes[dispute.id] ?? '').trim()}
              onClick={() => resolve(dispute.id, 'buyer')}
            >
              For the buyer
            </Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={!(notes[dispute.id] ?? '').trim()}
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

/* ---------------------------------------------------------------- */

function Integrity() {
  const [data] = useQueue('/admin/integrity');
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  async function inspect(sellerId) {
    if (open === sellerId) return setOpen(null);
    setOpen(sellerId);
    setDetail(null);
    const res = await api.get(`/admin/integrity/sellers/${sellerId}`).catch(() => null);
    setDetail(res);
  }

  if (!data) return <Loading />;
  const sellers = data.sellers ?? [];

  return (
    <div>
      <p className="measure pb-5 text-sm text-graphite">
        Patterns that tend to travel with a seller bidding on their own lots through a second
        account. None of it proves anything on its own — a high score is a reason to look, not a
        finding.
      </p>

      {sellers.length === 0 ? (
        <EmptyState title="Nothing worth a second look.">
          No seller currently shows a pattern above the threshold.
        </EmptyState>
      ) : (
        <div className="divide-y divide-rule border-t border-rule">
          {sellers.map((seller) => (
            <div key={seller.sellerId}>
              <button
                type="button"
                onClick={() => inspect(seller.sellerId)}
                aria-expanded={open === seller.sellerId}
                className="flex w-full items-center gap-4 py-4 text-left"
              >
                <span className="flex-1">
                  <span className="block text-sm text-ink">{seller.displayName}</span>
                  <span className="block text-xs text-graphite">
                    {seller.suspects} {seller.suspects === 1 ? 'account' : 'accounts'} flagged
                  </span>
                </span>
                <ScoreBar score={seller.topScore} />
              </button>

              {open === seller.sellerId && (
                <div className="rise pb-5">
                  {!detail ? (
                    <RowSkeleton />
                  ) : detail.suspects.length === 0 ? (
                    <p className="text-xs text-graphite">Nothing to show.</p>
                  ) : (
                    <ul className="space-y-3">
                      {detail.suspects.map((suspect) => (
                        <li key={suspect.bidderId} className="bg-sunk px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-ink">{suspect.displayName}</p>
                            <ScoreBar score={suspect.score} />
                          </div>
                          <p className="figures mt-1 text-xs text-graphite">
                            bid on {suspect.lotsBidOn} lots · {suspect.bidCount} bids · won{' '}
                            {suspect.won}
                          </p>
                          <ul className="mt-2 space-y-1">
                            {suspect.reasons.map((reason) => (
                              <li key={reason} className="text-xs text-ink-soft">
                                — {reason}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A bar rather than a number alone: a score is a comparison, and a
// comparison is easier to read as a length than as two digits.
function ScoreBar({ score }) {
  const hot = score >= 70;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="block h-1 w-16 bg-rule">
        <span
          className={`block h-full transition-[width] duration-500 ${hot ? 'bg-live' : 'bg-graphite'}`}
          style={{ width: `${Math.min(100, score)}%`, transitionTimingFunction: 'var(--ease)' }}
        />
      </span>
      <span className={`figures text-xs ${hot ? 'text-live' : 'text-graphite'}`}>{score}</span>
    </span>
  );
}
