import { Link } from 'react-router-dom';

const BASE =
  'inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const VARIANTS = {
  primary: 'bg-ink text-paper hover:bg-graphite',
  live: 'bg-live text-white hover:opacity-90',
  quiet: 'border border-rule text-ink hover:border-ink bg-transparent',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-6 text-base',
};

export function Button({ variant = 'primary', size = 'md', className = '', to, ...props }) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  if (to) return <Link to={to} className={classes} {...props} />;
  return <button className={classes} {...props} />;
}

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-graphite">{hint}</p>}
      {error && <p className="text-xs text-live">{error}</p>}
    </div>
  );
}

export const inputClass =
  'w-full border border-rule bg-raised px-3 py-2.5 text-ink placeholder:text-graphite focus:border-ink focus:outline-none';

// A spec line from a printed catalogue: label left, value right, hairline
// between. Used for condition, shipping, lot facts.
export function SpecRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-rule py-2.5 text-sm last:border-0">
      <dt className="text-graphite">{label}</dt>
      <dd className="text-ink text-right">{children}</dd>
    </div>
  );
}

export function Banner({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'border-rule text-graphite',
    live: 'border-live text-live',
    held: 'border-held text-held',
  };
  return <div className={`border-l-2 pl-3 py-1 text-sm ${tones[tone]}`}>{children}</div>;
}
