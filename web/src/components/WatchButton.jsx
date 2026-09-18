import { useState } from 'react';
import { api } from '../api.js';
import { BookmarkIcon } from './icons.jsx';

// Optimistic: the mark flips straight away and goes back if the server
// disagrees, because waiting on a round trip to acknowledge a bookmark
// feels broken.
export function WatchButton({ itemId, watching, onChange, size = 'md' }) {
  const [on, setOn] = useState(Boolean(watching));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const next = !on;
    setOn(next);
    setBusy(true);
    setFailed(false);
    try {
      if (next) await api.put(`/items/${itemId}/watch`);
      else await api.del(`/items/${itemId}/watch`);
      onChange?.(next);
    } catch (err) {
      // Put the mark back, and say so. Swallowing this silently makes a
      // broken toggle look like a working one that forgets.
      setOn(!next);
      setFailed(true);
      console.error('watch toggle failed', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 transition-colors duration-200 ${
        size === 'sm' ? 'text-xs' : 'text-sm'
      } ${
        failed
          ? 'border-live text-live'
          : on
            ? 'border-ink text-ink'
            : 'border-rule text-graphite hover:border-ink hover:text-ink'
      }`}
    >
      <BookmarkIcon on={on && !failed} size={size === 'sm' ? 12 : 14} />
      {failed ? 'Try again' : on ? 'Watching' : 'Watch'}
    </button>
  );
}
