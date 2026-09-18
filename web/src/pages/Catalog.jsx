import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ItemCard } from '../components/ItemCard.jsx';
import { Button, CardSkeleton, EmptyState, Tabs } from '../components/ui.jsx';
import { SearchIcon } from '../components/icons.jsx';

const FILTERS = [
  { key: 'ACTIVE', label: 'Live now' },
  { key: 'UPCOMING', label: 'Coming up' },
  { key: 'SETTLED,UNSOLD,ENDED', label: 'Closed' },
];

export function Catalog() {
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('ACTIVE');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const offsetRef = useRef(0);

  // Search runs when you stop typing, not on every keystroke - a
  // catalogue query per character is a request per character.
  useEffect(() => {
    const id = setTimeout(() => setQuery(typed.trim()), 280);
    return () => clearTimeout(id);
  }, [typed]);

  useEffect(() => {
    let live = true;
    setItems(null);
    const params = new URLSearchParams({ status, sort: status === 'ACTIVE' ? 'ending' : 'newest' });
    if (query) params.set('q', query);

    api
      .get(`/items?${params}`)
      .then((res) => {
        if (!live) return;
        offsetRef.current = res.serverNow - Date.now();
        setItems(res.items);
      })
      .catch(() => live && setItems([]));

    return () => {
      live = false;
    };
  }, [status, query]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pb-8">
        <div className="rise">
          <h1 className="display text-3xl text-ink sm:text-4xl">The catalogue</h1>
          <p className="measure mt-3 text-sm text-graphite">
            Physical goods, sold live. A bid in the final fifteen seconds moves the close, so
            nothing here is decided by whoever clicks last.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-graphite"
          />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search lots"
            aria-label="Search lots"
            className="w-full border-b border-rule bg-transparent py-2 pl-6 text-sm text-ink transition-colors placeholder:text-graphite hover:border-rule-strong focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      <Tabs tabs={FILTERS} value={status} onChange={setStatus} />

      <div className="pt-10">
        {items === null ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={query ? 'No lot matches that.' : 'Nothing in this part of the sale.'}
            action={
              query ? (
                <Button variant="quiet" onClick={() => setTyped('')}>
                  Clear the search
                </Button>
              ) : null
            }
          >
            {query
              ? 'Try a shorter search, or look at what is closing soon.'
              : 'Lots appear here as sellers list them.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="rise"
                // A short stagger so the grid settles rather than
                // appearing all at once. Capped, or the last card in a
                // long list arrives noticeably late.
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <ItemCard item={item} offsetRef={offsetRef} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
