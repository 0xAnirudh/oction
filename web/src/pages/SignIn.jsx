import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Button, Field, inputClass } from '../components/ui.jsx';

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
      <h1 className="display text-3xl text-ink">{registering ? 'Open an account' : 'Sign in'}</h1>
      <p className="mt-2 text-sm text-graphite">
        {registering
          ? 'Anyone may bid. Listing an item needs a verified seller account.'
          : 'Bid, watch a lot, or check what you have won.'}
      </p>

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

        {error && <p className="text-sm text-live">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {registering ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <button
        type="button"
        className="mt-6 text-sm text-graphite underline-offset-4 hover:text-ink hover:underline"
        onClick={() => {
          setMode(registering ? 'in' : 'up');
          setError(null);
        }}
      >
        {registering ? 'I already have an account' : 'I need an account'}
      </button>
    </div>
  );
}
