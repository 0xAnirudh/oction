import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ItemCard } from '../components/ItemCard.jsx';

const FILTERS = [
  { key: 'ACTIVE', label: 'Live now' },
  { key: 'UPCOMING', label: 'Coming up' },
  { key: 'SETTLED,UNSOLD,ENDED', label: 'Closed' },
];

export function Catalog() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('ACTIVE');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const offsetRef = useRef(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({
      status,
      sort: status === 'ACTIVE' ? 'ending' : 'newest',
    });
    if (query) params.set('q', query);

    api
      .get(`/items?${params}`)
      .then((res) => {
        if (!live) return;
        offsetRef.current = res.serverNow - Date.now();
        setItems(res.items);
      })
      .finally(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [status, query]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <h1 className="display text-4xl text-ink sm:text-5xl">The catalogue</h1>
          <p className="mt-2 max-w-md text-sm text-graphite">
            Physical goods, sold live. A bid in the final fifteen seconds moves the close, so
            nothing is decided by whoever clicks last.
          </p>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lots"
          aria-label="Search lots"
          className="w-full max-w-xs border-b border-rule bg-transparent py-2 text-ink placeholder:text-graphite focus:border-ink focus:outline-none sm:w-auto"
        />
      </div>

      <div className="flex gap-6 py-5">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatus(filter.key)}
            className={`text-sm transition-colors ${
              status === filter.key ? 'text-ink' : 'text-graphite hover:text-ink'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-sm text-graphite">Loading the catalogue…</p>
      ) : items.length === 0 ? (
        <div className="py-16">
          <p className="display text-2xl text-ink">Nothing here yet.</p>
          <p className="mt-2 text-sm text-graphite">
            {query ? 'No lot matches that search.' : 'No lots in this part of the sale.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} offsetRef={offsetRef} />
          ))}
        </div>
      )}
    </div>
  );
}
