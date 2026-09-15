import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Button, Field, inputClass, Banner } from '../components/ui.jsx';

export function SignIn() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('in');
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === 'up';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (forgetting) {
        await api.post('/auth/password/forgot', { email: form.email });
        // The server answers the same either way, so the page does too -
        // saying "no such account" here would make this a way to find
        // out which addresses are registered.
        setSentReset(true);
        return;
      }
      if (registering) await signUp(form);
      else await signIn({ email: form.email, password: form.password });
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="display text-3xl text-ink">
        {forgetting ? 'Reset your password' : registering ? 'Open an account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm text-graphite">
        {forgetting
          ? 'We will send a link to the address on the account.'
          : registering
            ? 'Anyone may bid. Listing an item needs a verified seller account.'
            : 'Bid, watch a lot, or check what you have won.'}
      </p>

      {sentReset && (
        <div className="mt-6">
          <Banner tone="held">
            If that address has an account, a reset link is on its way. The link lasts an hour.
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

        {error && <p className="text-sm text-live">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy || sentReset}>
          {forgetting ? 'Send the link' : registering ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-start gap-2">
        <button
          type="button"
          className="text-sm text-graphite underline-offset-4 hover:text-ink hover:underline"
          onClick={() => {
            setMode(registering || forgetting ? 'in' : 'up');
            setError(null);
            setSentReset(false);
          }}
        >
          {registering || forgetting ? 'Back to sign in' : 'I need an account'}
        </button>

        {mode === 'in' && (
          <button
            type="button"
            className="text-sm text-graphite underline-offset-4 hover:text-ink hover:underline"
            onClick={() => {
              setMode('forgot');
              setError(null);
            }}
          >
            I have forgotten my password
          </button>
        )}
      </div>
    </div>
  );
}
