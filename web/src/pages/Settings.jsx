import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatWhen } from '../format.js';
import {
  Button,
  Banner,
  SpecRow,
  Toggle,
  Dialog,
  RowSkeleton,
  Field,
  inputClass,
} from '../components/ui.jsx';
import { DeviceIcon, TrashIcon } from '../components/icons.jsx';

const NOTICES = [
  { key: 'outbid', label: 'When I am outbid', hint: 'The moment someone goes over you.' },
  { key: 'won', label: 'When I win a lot', hint: 'With the deadline for completing checkout.' },
  { key: 'closingSoon', label: 'Before a watched lot closes', hint: 'Confirmed addresses only.' },
];

export function Settings() {
  const { user, refresh, signOut } = useAuth();
  const [notify, setNotify] = useState(user?.notify ?? {});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function toggle(key) {
    const next = { ...notify, [key]: !notify[key] };
    setNotify(next);
    await api.patch('/me/notifications', { [key]: next[key] }).catch(() => setNotify(notify));
  }

  async function resendVerification() {
    setBusy(true);
    await api.post('/auth/verify/request').catch(() => {});
    setMessage('Sent. Check the address on this account.');
    setBusy(false);
  }

  async function applyToSell() {
    setBusy(true);
    try {
      await api.post('/me/seller-application');
      await refresh();
      setMessage('Application received. Somebody will look at it.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sellerCopy = {
    unverified: 'Not a seller',
    pending: 'Application under review',
    verified: 'Verified seller',
  }[user?.sellerStatus ?? 'unverified'];

  return (
    <div className="max-w-xl">
      <h1 className="display text-3xl text-ink sm:text-4xl">Settings</h1>

      <Section title="Account">
        <dl>
          <SpecRow label="Name">{user?.displayName}</SpecRow>
          <SpecRow label="Email">{user?.email}</SpecRow>
          <SpecRow label="Confirmed">
            <span className={user?.emailVerified ? 'text-held' : 'text-live'}>
              {user?.emailVerified ? 'Yes' : 'Not yet'}
            </span>
          </SpecRow>
          <SpecRow label="Selling">{sellerCopy}</SpecRow>
          <SpecRow label="Terms accepted">
            {user?.termsAcceptedAt ? formatWhen(user.termsAcceptedAt) : '—'}
          </SpecRow>
        </dl>

        {!user?.emailVerified && (
          <div className="mt-5 space-y-3">
            <Banner tone="live">
              Confirm your address to save lots, receive notices and apply to sell.
            </Banner>
            <Button variant="quiet" size="sm" onClick={resendVerification} busy={busy}>
              Send the link again
            </Button>
          </div>
        )}

        {user?.emailVerified && user?.sellerStatus === 'unverified' && (
          <Button variant="quiet" size="sm" className="mt-5" onClick={applyToSell} busy={busy}>
            Apply to sell
          </Button>
        )}

        {message && <p className="mt-4 text-xs text-graphite">{message}</p>}
      </Section>

      <Section title="Email me">
        <ul>
          {NOTICES.map((notice) => (
            <li
              key={notice.key}
              className="flex items-center justify-between gap-6 border-b border-rule py-3.5 last:border-0"
            >
              <div>
                <p className="text-sm text-ink">{notice.label}</p>
                <p className="text-xs text-graphite">{notice.hint}</p>
              </div>
              <Toggle
                checked={Boolean(notify[notice.key])}
                onChange={() => toggle(notice.key)}
                label={notice.label}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Sessions />

      <CloseAccount onClosed={signOut} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-12">
      <h2 className="display-sm border-b border-rule pb-2 text-lg text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Sessions() {
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(
    () =>
      api
        .get('/me/sessions')
        .then((res) => setSessions(res.sessions))
        .catch(() => setSessions([])),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function end(id) {
    setBusy(id);
    try {
      await api.del(`/me/sessions/${id}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function endAll() {
    setBusy('all');
    try {
      await api.del('/me/sessions');
      await load();
    } finally {
      setBusy(null);
    }
  }

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <Section title="Signed in on">
      {sessions === null ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : (
        <>
          <ul>
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-4 border-b border-rule py-3.5 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DeviceIcon size={15} className="text-graphite" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {session.label}
                      {session.current && (
                        <span className="ml-2 text-2xs uppercase tracking-wider text-held">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-graphite">
                      Last used {formatWhen(session.lastSeenAt)}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    onClick={() => end(session.id)}
                    disabled={busy === session.id}
                    aria-label={`Sign out ${session.label}`}
                    className="shrink-0 text-graphite transition-colors hover:text-live disabled:opacity-40"
                  >
                    <TrashIcon size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {others > 0 && (
            <Button
              variant="quiet"
              size="sm"
              className="mt-4"
              onClick={endAll}
              busy={busy === 'all'}
            >
              Sign out the other {others === 1 ? 'device' : `${others} devices`}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

function CloseAccount({ onClosed }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function check() {
    setOpen(true);
    setState(null);
    const res = await api.get('/me/deletion').catch(() => null);
    setState(res);
  }

  async function close() {
    setBusy(true);
    setError(null);
    try {
      await api.del('/me');
      onClosed();
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Section title="Closing this account">
      <p className="measure text-sm text-graphite">
        Your name and address are removed. Bids you placed on lots other people also bid on stay in
        the record, with your name replaced — a finished auction is not only yours to erase.
      </p>
      <Button variant="danger" size="sm" className="mt-4" onClick={check}>
        Close my account
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Close this account"
        description="This cannot be undone."
      >
        {state === null ? (
          <RowSkeleton />
        ) : state.canDelete ? (
          <div className="space-y-5">
            <Banner tone="live">
              Your email, display name and saved address are removed and you are signed out
              everywhere. Past bids stay in the log under “Closed account”.
            </Banner>

            <Field label="Type CLOSE to confirm" id="confirm-close" error={error}>
              <input
                id="confirm-close"
                className={inputClass}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </Field>

            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                disabled={confirm !== 'CLOSE'}
                busy={busy}
                onClick={close}
              >
                Close the account
              </Button>
              <Button variant="quiet" onClick={() => setOpen(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-graphite">
              Not yet — these have to finish first, because closing now would strand somebody else.
            </p>
            <ul className="space-y-2">
              {state.blockers.map((blocker) => (
                <li key={blocker.code}>
                  <Banner tone="waiting">{blocker.message}</Banner>
                </li>
              ))}
            </ul>
            <Button variant="quiet" className="w-full" onClick={() => setOpen(false)}>
              Close this window
            </Button>
          </div>
        )}
      </Dialog>
    </Section>
  );
}
