import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ItemCard } from '../components/ItemCard.jsx';
import { Button } from '../components/ui.jsx';

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

  if (items === null) return <p className="py-16 text-sm text-graphite">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="py-16">
        <h1 className="display text-3xl text-ink">Nothing saved.</h1>
        <p className="mt-2 max-w-md text-sm text-graphite">
          Mark a lot to keep it here. You will get a note before anything on this list closes.
        </p>
        <Button to="/" variant="quiet" className="mt-6">
          Browse the catalogue
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-rule pb-6">
        <h1 className="display text-4xl text-ink">Watching</h1>
        <p className="mt-2 text-sm text-graphite">Closing soonest first.</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} offsetRef={offsetRef} />
        ))}
      </div>
    </div>
  );
}
