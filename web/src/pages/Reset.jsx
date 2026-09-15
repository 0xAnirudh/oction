import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { Button, Field, inputClass, Banner } from '../components/ui.jsx';

export function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/password/reset', { token, password });
      setToken(res.token);
      // A full load rather than a client navigation: the auth context
      // and the socket both need to come back up holding the new
      // session, and every other device has just been signed out.
      window.location.assign('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <h1 className="display text-3xl text-ink">Nothing to reset.</h1>
        <p className="mt-2 text-sm text-graphite">That link is missing its token.</p>
        <Button to="/sign-in" className="mt-8">
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="display text-3xl text-ink">Choose a new password</h1>
      <div className="mt-4">
        <Banner>Setting it signs out every device currently holding a session.</Banner>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="New password" id="password" hint="At least ten characters.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            autoFocus
          />
        </Field>

        {error && <p className="text-sm text-live">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Setting…' : 'Set password'}
        </Button>
      </form>

      <Link to="/sign-in" className="mt-6 inline-block text-sm text-graphite hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
