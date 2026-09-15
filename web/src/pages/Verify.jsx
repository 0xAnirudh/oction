import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Button } from '../components/ui.jsx';

export function Verify() {
  const [params] = useSearchParams();
  const [state, setState] = useState('working');

  useEffect(() => {
    const token = params.get('token');
    if (!token) return setState('missing');

    api
      .post('/auth/verify/confirm', { token })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [params]);

  const copy = {
    working: { title: 'Confirming…', body: 'One moment.' },
    done: {
      title: 'Address confirmed.',
      body: 'You can bid, save lots, and apply to sell.',
    },
    missing: { title: 'Nothing to confirm.', body: 'That link is missing its token.' },
    failed: {
      title: 'That link has expired.',
      body: 'Verification links last a day and can be used once. Ask for a new one from your settings.',
    },
  }[state];

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="display text-3xl text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm text-graphite">{copy.body}</p>
      <div className="mt-8 flex gap-3">
        <Button to="/">Back to the catalogue</Button>
        {state === 'failed' && (
          <Button to="/settings" variant="quiet">
            Settings
          </Button>
        )}
      </div>
    </div>
  );
}
