import { useState } from 'react';
import { api } from '../api.js';
import { Button, Dialog, Field, inputClass, Banner } from './ui.jsx';

const REASONS = [
  { value: 'counterfeit', label: 'It is counterfeit' },
  { value: 'prohibited_item', label: 'It should not be sold here' },
  { value: 'misleading_description', label: 'The description is misleading' },
  { value: 'stolen_goods', label: 'It may be stolen' },
  { value: 'offensive_content', label: 'The listing is offensive' },
  { value: 'other', label: 'Something else' },
];

export function ReportDialog({ itemId, open, onClose }) {
  const [form, setForm] = useState({ reason: 'counterfeit', detail: '' });
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.post(`/items/${itemId}/report`, form);
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('idle');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report this lot"
      description="Goes to staff, not to the seller. They are not told who reported it."
    >
      {state === 'sent' ? (
        <div className="space-y-5">
          <Banner tone="held">
            Reported. Somebody will look at it, and the lot may be taken down.
          </Banner>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="What is wrong with it" id="report-reason">
            <select
              id="report-reason"
              className={inputClass}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Anything that would help"
            id="report-detail"
            hint="Optional, but a specific detail is worth more than a strong adjective."
            error={error}
          >
            <textarea
              id="report-detail"
              rows={3}
              className={inputClass}
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              maxLength={2000}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" busy={state === 'sending'} className="flex-1">
              Send the report
            </Button>
            <Button type="button" variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
