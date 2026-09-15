import { useState } from 'react';
import { api } from '../api.js';

// A saved lot, not the live watcher count. Optimistic: the mark flips
// straight away and goes back if the server disagrees, because waiting
// on a round trip to acknowledge a bookmark feels broken.
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
      className={`inline-flex items-center gap-1.5 transition-colors ${
        size === 'sm' ? 'text-xs' : 'text-sm'
      } ${on ? 'text-ink' : 'text-graphite hover:text-ink'}`}
    >
      <svg
        width={size === 'sm' ? 12 : 14}
        height={size === 'sm' ? 12 : 14}
        viewBox="0 0 16 16"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M3 2h10v12l-5-3.5L3 14V2Z" strokeLinejoin="round" />
      </svg>
      {failed ? 'Try again' : on ? 'Watching' : 'Watch'}
    </button>
  );
}
