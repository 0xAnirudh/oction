import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Button, Field, inputClass, Banner } from '../components/ui.jsx';
import { CheckIcon } from '../components/icons.jsx';

const COPY = {
  in: {
    title: 'Sign in',
    blurb: 'Bid, watch a lot, or check what you have won.',
    action: 'Sign in',
  },
  up: {
    title: 'Open an account',
    blurb: 'Anyone may bid. Listing an item needs a verified seller account.',
    action: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    blurb: 'We will send a link to the address on the account.',
    action: 'Send the link',
  },
};

export function SignIn() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('in');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [sentReset, setSentReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const registering = mode === 'up';
  const forgetting = mode === 'forgot';
  const copy = COPY[mode];
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function switchTo(next) {
    setMode(next);
    setError(null);
    setSentReset(false);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (forgetting) {
        await api.post('/auth/password/forgot', { email: form.email });
        // The server answers the same either way, so the page does too.
        // Saying "no such account" here would make this a way to find
        // out which addresses are registered.
        setSentReset(true);
        return;
      }
      if (registering) await signUp({ ...form, acceptTerms: accepted });
      else await signIn({ email: form.email, password: form.password });
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise mx-auto max-w-sm py-6">
      <h1 className="display text-3xl text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm text-graphite">{copy.blurb}</p>

      {sentReset && (
        <div className="mt-6">
          <Banner tone="held">
            If that address has an account, a reset link is on its way. It lasts an hour.
          </Banner>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-5">
        {registering && (
          <Field label="Display name" id="displayName" hint="Shown next to your bids.">
            <input
              id="displayName"
              className={inputClass}
              value={form.displayName}
              onChange={set('displayName')}
              required
              minLength={2}
              maxLength={40}
            />
          </Field>
        )}

        <Field label="Email" id="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>

        {!forgetting && (
          <Field
            label="Password"
            id="password"
            hint={registering ? 'At least ten characters.' : undefined}
          >
            <input
              id="password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              className={inputClass}
              value={form.password}
              onChange={set('password')}
              required
              minLength={registering ? 10 : 1}
            />
          </Field>
        )}

        {registering && (
          // Ticked deliberately, never pre-ticked. A bid here is
          // binding, and that is not something to hold anyone to on the
          // strength of a default.
          <button
            type="button"
            onClick={() => setAccepted((a) => !a)}
            aria-pressed={accepted}
            className="flex w-full items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border transition-colors duration-200 ${
                accepted ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-transparent'
              }`}
            >
              <CheckIcon size={11} />
            </span>
            <span className="text-xs text-graphite">
              I have read the{' '}
              <Link to="/terms" className="text-ink underline underline-offset-2">
                terms
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" className="text-ink underline underline-offset-2">
                privacy notice
              </Link>
              , and I understand that a bid I place is binding.
            </span>
          </button>
        )}

        {error && (
          <p role="alert" className="text-xs text-live">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          busy={busy}
          disabled={sentReset || (registering && !accepted)}
        >
          {copy.action}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-start gap-2">
        <button
          type="button"
          className="text-xs text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
          onClick={() => switchTo(registering || forgetting ? 'in' : 'up')}
        >
          {registering || forgetting ? 'Back to sign in' : 'I need an account'}
        </button>

        {mode === 'in' && (
          <button
            type="button"
            className="text-xs text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
            onClick={() => switchTo('forgot')}
          >
            I have forgotten my password
          </button>
        )}
      </div>
    </div>
  );
}
