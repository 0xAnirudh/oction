import { useEffect, useState } from 'react';
import { ChevronIcon } from './icons.jsx';

// A plate, not a card: the photograph sits on the page with a hairline
// under it and the other angles listed beneath, the way a catalogue
// shows a lot.
export function Carousel({ images = [], title }) {
  const [index, setIndex] = useState(0);
  const count = images.length;

  useEffect(() => {
    if (count < 2) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  if (count === 0) {
    return (
      <div className="grid aspect-4/3 w-full place-items-center border border-rule bg-sunk">
        <span className="text-xs text-graphite">No photographs</span>
      </div>
    );
  }

  const active = images[Math.min(index, count - 1)];
  const step = (delta) => setIndex((i) => (i + delta + count) % count);

  return (
    <div>
      <div className="group relative aspect-4/3 w-full overflow-hidden border border-rule bg-sunk">
        <img
          key={active.url}
          src={active.url}
          alt={`${title}, view ${index + 1} of ${count}`}
          className="rise h-full w-full object-cover"
        />

        {count > 1 && (
          <>
            {/* Controls stay out of the photograph until the pointer is
                on it, then sit over the plate rather than beside it. */}
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous view"
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center border border-rule bg-paper/90 text-ink opacity-0 transition-opacity duration-200 hover:bg-paper focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronIcon dir="left" size={15} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next view"
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center border border-rule bg-paper/90 text-ink opacity-0 transition-opacity duration-200 hover:bg-paper focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronIcon dir="right" size={15} />
            </button>
            <p className="figures absolute bottom-3 right-3 bg-paper/90 px-2 py-0.5 text-2xs text-graphite">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`View ${i + 1}`}
              aria-current={i === index}
              className={`h-16 w-16 shrink-0 overflow-hidden border transition-all duration-200 ${
                i === index ? 'border-ink opacity-100' : 'border-rule opacity-55 hover:opacity-100'
              }`}
            >
              <img
                src={image.thumbUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
