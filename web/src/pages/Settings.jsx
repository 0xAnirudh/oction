import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Banner, SpecRow } from '../components/ui.jsx';

const NOTICES = [
  { key: 'outbid', label: 'When I am outbid' },
  { key: 'won', label: 'When I win a lot' },
  { key: 'closingSoon', label: 'Before a watched lot closes' },
];

export function Settings() {
  const { user, refresh } = useAuth();
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
    unverified: 'Not a seller.',
    pending: 'Application under review.',
    verified: 'Verified seller.',
  }[user?.sellerStatus ?? 'unverified'];

  return (
    <div className="max-w-xl">
      <h1 className="display text-4xl text-ink">Settings</h1>

      <section className="mt-10">
        <h2 className="display border-b border-rule pb-2 text-xl text-ink">Account</h2>
        <dl className="mt-3">
          <SpecRow label="Name">{user?.displayName}</SpecRow>
          <SpecRow label="Email">{user?.email}</SpecRow>
          <SpecRow label="Confirmed">{user?.emailVerified ? 'Yes' : 'Not yet'}</SpecRow>
          <SpecRow label="Selling">{sellerCopy}</SpecRow>
        </dl>

        {!user?.emailVerified && (
          <div className="mt-5 space-y-3">
            <Banner tone="live">
              Confirm your address to save lots, receive notices and apply to sell.
            </Banner>
            <Button variant="quiet" size="sm" onClick={resendVerification} disabled={busy}>
              Send the link again
            </Button>
          </div>
        )}

        {user?.emailVerified && user?.sellerStatus === 'unverified' && (
          <Button variant="quiet" size="sm" className="mt-5" onClick={applyToSell} disabled={busy}>
            Apply to sell
          </Button>
        )}

        {message && <p className="mt-4 text-sm text-graphite">{message}</p>}
      </section>

      <section className="mt-12">
        <h2 className="display border-b border-rule pb-2 text-xl text-ink">Email me</h2>
        <ul className="mt-2">
          {NOTICES.map((notice) => (
            <li
              key={notice.key}
              className="flex items-center justify-between border-b border-rule py-3 last:border-0"
            >
              <span className="text-sm text-ink">{notice.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(notify[notice.key])}
                onClick={() => toggle(notice.key)}
                className={`h-6 w-11 shrink-0 border transition-colors ${
                  notify[notice.key] ? 'border-ink bg-ink' : 'border-rule bg-transparent'
                }`}
              >
                <span
                  className={`block h-4 w-4 bg-paper transition-transform ${
                    notify[notice.key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-graphite">
          Notices about a lot closing only go to confirmed addresses.
        </p>
      </section>
    </div>
  );
}
