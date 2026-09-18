import { Link } from 'react-router-dom';
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon } from './icons.jsx';

/* ------------------------------------------------------------------ *
 * Buttons. Square, because every rule on this page is square; the
 * radius is the one the catalogue already uses, which is none.
 * ------------------------------------------------------------------ */

const BASE =
  'relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-[background-color,color,border-color,transform] duration-200 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-40';

const VARIANTS = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  live: 'bg-live text-white hover:brightness-110',
  quiet: 'border border-rule text-ink hover:border-ink hover:bg-sunk',
  ghost: 'text-graphite hover:text-ink hover:bg-sunk',
  danger: 'border border-live text-live hover:bg-live hover:text-white',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-13 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  to,
  href,
  busy = false,
  children,
  ...props
}) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  const inner = (
    <>
      {busy && (
        <span
          className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {inner}
      </a>
    );
  }
  return (
    <button className={classes} disabled={busy || props.disabled} {...props}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Forms
 * ------------------------------------------------------------------ */

export const inputClass =
  'w-full border border-rule bg-raised px-3 py-2.5 text-sm text-ink ' +
  'placeholder:text-graphite transition-colors duration-200 ' +
  'hover:border-rule-strong focus:border-ink focus:outline-none ' +
  'disabled:bg-sunk disabled:text-graphite';

export function Field({ label, hint, error, children, id, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium tracking-wide text-ink">
        {label}
      </label>
      {children}
      {/* The hint is replaced by the error rather than joined by it, so
          the field never grows as you type into it. */}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-live">
          <AlertIcon size={13} className="mt-0.5" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-graphite">{hint}</p>
      ) : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 border transition-colors duration-200 disabled:opacity-40 ${
        checked ? 'border-ink bg-ink' : 'border-rule-strong bg-transparent'
      }`}
    >
      <span
        className={`absolute top-1/2 block h-4 w-4 -translate-y-1/2 transition-transform duration-250 ${
          checked ? 'translate-x-6 bg-paper' : 'translate-x-1 bg-rule-strong'
        }`}
        style={{ transitionTimingFunction: 'var(--ease)' }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * A spec line from a printed catalogue: label left, value right,
 * hairline between.
 * ------------------------------------------------------------------ */

export function SpecRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-rule py-2.5 text-sm last:border-0">
      <dt className="shrink-0 text-graphite">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notices. A tinted ground and an icon rather than a coloured bar down
 * the side - a 2px rule in a red nobody else on the page uses reads as
 * a component from somewhere else.
 * ------------------------------------------------------------------ */

const TONES = {
  neutral: { cls: 'bg-sunk text-graphite', Icon: null },
  live: { cls: 'bg-live-soft text-live', Icon: AlertIcon },
  held: { cls: 'bg-held-soft text-held', Icon: CheckIcon },
  waiting: { cls: 'bg-sunk text-ink-soft', Icon: ClockIcon },
};

export function Banner({ tone = 'neutral', children, onDismiss }) {
  const { cls, Icon } = TONES[tone] ?? TONES.neutral;
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 text-xs ${cls}`}>
      {Icon && <Icon size={14} className="mt-px" />}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="opacity-60 hover:opacity-100"
        >
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Waiting and nothing-here. Both are states the page spends real time
 * in, so both are drawn rather than left as a word.
 * ------------------------------------------------------------------ */

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-rule py-4">
      <Skeleton className="h-14 w-14" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/5" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="border-t border-rule py-20">
      <p className="display text-2xl text-ink">{title}</p>
      {children && <p className="measure mt-2 text-sm text-graphite">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs. A row of hairline-underlined words, not pills.
 * ------------------------------------------------------------------ */

export function Tabs({ tabs, value, onChange, counts = {} }) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-rule">
      {tabs.map((tab) => {
        const active = value === tab.key;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-current={active}
            className={`-mb-px shrink-0 border-b py-3 text-sm transition-colors duration-200 ${
              active
                ? 'border-ink text-ink'
                : 'border-transparent text-graphite hover:border-rule-strong hover:text-ink'
            }`}
          >
            {tab.label}
            {count > 0 && <span className="figures ml-2 text-xs text-graphite">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A dialog, for the two things that genuinely warrant interrupting:
 * reporting a listing, and closing an account.
 * ------------------------------------------------------------------ */

export function Dialog({ open, onClose, title, description, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="rise max-h-[90dvh] w-full max-w-md overflow-y-auto border border-rule bg-paper p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="display-sm text-xl text-ink">{title}</h2>
            {description && <p className="mt-1 text-xs text-graphite">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-graphite transition-colors hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* A readout, not a hero metric: the number leads, the word that names
   it sits under at label size, and the row reads as instrumentation. */
export function Readout({ label, value, tone = 'ink' }) {
  const tones = { ink: 'text-ink', live: 'text-live', held: 'text-held' };
  return (
    <div>
      <p className={`display figures text-2xl ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-graphite">{label}</p>
    </div>
  );
}
