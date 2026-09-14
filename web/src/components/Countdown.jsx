import { useEffect, useRef, useState } from 'react';
import { formatRemaining } from '../format.js';

// The server's clock is the only one that decides anything, so the
// client tracks its offset from it and counts against that. A bidder
// whose laptop is forty seconds fast should not see an auction end
// forty seconds early.
export function useServerClock(serverNow) {
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = serverNow - Date.now();
  }, [serverNow]);
  return offset;
}

export function useRemaining(endTime, offsetRef) {
  const [remaining, setRemaining] = useState(() => msLeft(endTime, offsetRef));

  useEffect(() => {
    if (!endTime) return undefined;
    setRemaining(msLeft(endTime, offsetRef));
    const id = setInterval(() => setRemaining(msLeft(endTime, offsetRef)), 250);
    return () => clearInterval(id);
  }, [endTime, offsetRef]);

  return remaining;
}

function msLeft(endTime, offsetRef) {
  if (!endTime) return 0;
  return Math.max(0, new Date(endTime).getTime() - (Date.now() + (offsetRef?.current ?? 0)));
}

export function Countdown({ remaining, critical, size = 'md' }) {
  const classes = {
    sm: 'text-base',
    md: 'text-2xl',
    lg: 'text-6xl sm:text-7xl',
  };

  return (
    <span
      className={`display figures tabular-nums transition-colors duration-500 ${classes[size]} ${
        critical ? 'text-live' : 'text-ink'
      }`}
      style={critical && size === 'lg' ? { letterSpacing: '-0.03em' } : undefined}
      aria-label={`${formatRemaining(remaining)} remaining`}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
