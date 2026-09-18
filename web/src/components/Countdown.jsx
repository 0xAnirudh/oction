import { useEffect, useRef, useState } from 'react';
import { formatRemaining } from '../format.js';

// The server's clock is the only one that decides anything, so the
// client tracks its offset from it and counts against that. A laptop
// forty seconds fast should not show an auction ending forty seconds
// early.
export function useServerClock(serverNow) {
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = serverNow - Date.now();
  }, [serverNow]);
  return offset;
}

function msLeft(endTime, offsetRef) {
  if (!endTime) return 0;
  return Math.max(0, new Date(endTime).getTime() - (Date.now() + (offsetRef?.current ?? 0)));
}

export function useRemaining(endTime, offsetRef) {
  const [remaining, setRemaining] = useState(() => msLeft(endTime, offsetRef));

  useEffect(() => {
    if (!endTime) return undefined;
    setRemaining(msLeft(endTime, offsetRef));

    // Four times a second while it matters, once a second when it does
    // not. A lot closing next Tuesday does not need sixty repaints a
    // minute, and a lot closing in nine seconds does.
    const interval = msLeft(endTime, offsetRef) <= 120_000 ? 250 : 1000;
    const id = setInterval(() => setRemaining(msLeft(endTime, offsetRef)), interval);
    return () => clearInterval(id);
  }, [endTime, offsetRef, remaining <= 120_000]);

  return remaining;
}

const SIZES = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl sm:text-4xl',
};

export function Countdown({ remaining, critical, size = 'md', className = '' }) {
  const text = formatRemaining(remaining);
  return (
    <span
      className={`display figures block transition-colors duration-700 ${SIZES[size]} ${
        critical ? 'text-live' : 'text-ink'
      } ${className}`}
      // Tightens as it goes critical: the number gets denser and more
      // urgent without changing size and shoving the layout around.
      style={{ letterSpacing: critical ? '-0.045em' : '-0.018em' }}
    >
      <span className="sr-only">{text} remaining</span>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
