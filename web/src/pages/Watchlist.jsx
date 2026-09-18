import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ItemCard } from '../components/ItemCard.jsx';
import { Button, CardSkeleton, EmptyState } from '../components/ui.jsx';

export function Watchlist() {
  const [items, setItems] = useState(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    api
      .get('/watchlist')
      .then((res) => {
        offsetRef.current = res.serverNow - Date.now();
        setItems(res.items);
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <div>
      <div className="pb-8">
        <h1 className="display text-3xl text-ink sm:text-4xl">Watching</h1>
        <p className="measure mt-3 text-sm text-graphite">
          Closing soonest first. You get a note before anything on this list closes, provided your
          address is confirmed.
        </p>
      </div>

      {items === null ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing saved." action={<Button to="/">Browse the catalogue</Button>}>
          Mark a lot to keep it here, and you will be told before it closes.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rise"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <ItemCard item={item} offsetRef={offsetRef} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
