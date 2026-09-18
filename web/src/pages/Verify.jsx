import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Button, Skeleton } from '../components/ui.jsx';
import { CheckIcon, AlertIcon } from '../components/icons.jsx';

const COPY = {
  done: {
    title: 'Address confirmed.',
    body: 'You can bid, save lots, and apply to sell.',
    tone: 'held',
  },
  missing: {
    title: 'Nothing to confirm.',
    body: 'That link is missing its token.',
    tone: 'live',
  },
  failed: {
    title: 'That link has expired.',
    body: 'Confirmation links last a day and can be used once. Ask for a new one from your settings.',
    tone: 'live',
  },
};

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

  if (state === 'working') {
    return (
      <div className="mx-auto max-w-sm space-y-3 py-20">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const copy = COPY[state];
  const Icon = copy.tone === 'held' ? CheckIcon : AlertIcon;

  return (
    <div className="rise mx-auto max-w-sm py-20">
      <Icon size={22} className={copy.tone === 'held' ? 'text-held' : 'text-live'} />
      <h1 className="display mt-4 text-3xl text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm text-graphite">{copy.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
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
