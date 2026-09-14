import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { parseAmount } from '../format.js';
import { Button, Field, inputClass } from '../components/ui.jsx';

const CONDITIONS = ['Brand New', 'Like New', 'Used', 'Vintage'];

// A datetime-local input wants "YYYY-MM-DDTHH:mm" in local time.
function localInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function NewListing() {
  const navigate = useNavigate();
  const now = new Date();
  const [form, setForm] = useState({
    title: '',
    description: '',
    condition: 'Used',
    startingPrice: '',
    reservePrice: '',
    bidIncrement: '',
    startTime: localInput(now),
    endTime: localInput(new Date(now.getTime() + 60 * 60 * 1000)),
    shipsFrom: '',
    weightKg: '',
  });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError(null);

    const startingPriceCents = parseAmount(form.startingPrice);
    if (startingPriceCents === null || startingPriceCents < 1) {
      return setError('Enter a starting price like 250.00');
    }
    const reservePriceCents = form.reservePrice ? parseAmount(form.reservePrice) : 0;
    if (reservePriceCents === null) return setError('The reserve is not an amount.');
    const bidIncrementCents = form.bidIncrement ? parseAmount(form.bidIncrement) : null;

    setBusy(true);
    try {
      const { item } = await api.post('/items', {
        title: form.title,
        description: form.description,
        condition: form.condition,
        startingPriceCents,
        reservePriceCents,
        bidIncrementCents,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        shippingDetails: {
          shipsFrom: form.shipsFrom || undefined,
          weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        },
      });

      if (files.length) {
        const body = new FormData();
        for (const file of files) body.append('images', file);
        await api.upload(`/items/${item.id}/images`, body);
      }

      navigate(`/lot/${item.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="display text-4xl text-ink">List an item</h1>
      <p className="mt-2 text-sm text-graphite">
        The reserve stays secret — bidders are told only whether it has been met. Photographs are
        fixed once bidding starts.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-6">
        <Field label="Title" id="title">
          <input
            id="title"
            className={inputClass}
            value={form.title}
            onChange={set('title')}
            required
            minLength={3}
            maxLength={140}
          />
        </Field>

        <Field label="Description" id="description">
          <textarea
            id="description"
            rows={4}
            className={inputClass}
            value={form.description}
            onChange={set('description')}
            maxLength={4000}
          />
        </Field>

        <Field label="Condition" id="condition">
          <select
            id="condition"
            className={inputClass}
            value={form.condition}
            onChange={set('condition')}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Starting price" id="startingPrice" hint="What it opens at.">
            <input
              id="startingPrice"
              className={inputClass}
              value={form.startingPrice}
              onChange={set('startingPrice')}
              placeholder="250.00"
              inputMode="decimal"
              required
            />
          </Field>
          <Field label="Reserve" id="reservePrice" hint="Optional, secret.">
            <input
              id="reservePrice"
              className={inputClass}
              value={form.reservePrice}
              onChange={set('reservePrice')}
              placeholder="none"
              inputMode="decimal"
            />
          </Field>
          <Field label="Increment" id="bidIncrement" hint="Blank uses the ladder.">
            <input
              id="bidIncrement"
              className={inputClass}
              value={form.bidIncrement}
              onChange={set('bidIncrement')}
              placeholder="auto"
              inputMode="decimal"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Opens" id="startTime">
            <input
              id="startTime"
              type="datetime-local"
              className={inputClass}
              value={form.startTime}
              onChange={set('startTime')}
              required
            />
          </Field>
          <Field label="Closes" id="endTime" hint="At least a minute after opening.">
            <input
              id="endTime"
              type="datetime-local"
              className={inputClass}
              value={form.endTime}
              onChange={set('endTime')}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ships from" id="shipsFrom" hint="Optional.">
            <input
              id="shipsFrom"
              className={inputClass}
              value={form.shipsFrom}
              onChange={set('shipsFrom')}
            />
          </Field>
          <Field label="Weight (kg)" id="weightKg" hint="Optional.">
            <input
              id="weightKg"
              className={inputClass}
              value={form.weightKg}
              onChange={set('weightKg')}
              inputMode="decimal"
            />
          </Field>
        </div>

        <Field label="Photographs" id="images" hint="Up to eight. JPEG, PNG, WebP or AVIF.">
          <input
            id="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={(e) => setFiles([...e.target.files].slice(0, 8))}
            className="block w-full text-sm text-graphite file:mr-4 file:border file:border-rule file:bg-transparent file:px-4 file:py-2 file:text-sm file:text-ink"
          />
        </Field>

        {error && <p className="text-sm text-live">{error}</p>}

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Listing…' : 'List the item'}
        </Button>
      </form>
    </div>
  );
}
