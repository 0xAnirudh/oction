import { useState } from 'react';

// A plate, not a card. The photograph sits on the page with a hairline
// under it and the other angles listed beneath, the way a catalogue
// shows a lot.
export function Carousel({ images = [], title }) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="aspect-4/3 w-full border border-rule bg-raised grid place-items-center">
        <span className="text-graphite text-sm">No photographs</span>
      </div>
    );
  }

  const active = images[Math.min(index, images.length - 1)];

  return (
    <div>
      <div className="aspect-4/3 w-full overflow-hidden border border-rule bg-raised">
        <img
          src={active.url}
          alt={`${title} — view ${index + 1} of ${images.length}`}
          className="h-full w-full object-cover"
          loading="eager"
        />
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`View ${i + 1}`}
              aria-current={i === index}
              className={`h-16 w-16 shrink-0 overflow-hidden border transition-opacity ${
                i === index ? 'border-ink opacity-100' : 'border-rule opacity-60 hover:opacity-100'
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
