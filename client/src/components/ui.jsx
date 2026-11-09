// Reusable UI primitives.

import { useState } from 'react';
import { AlertTriangle, Inbox, Loader2, Info, ChevronDown } from 'lucide-react';
import { rateMetric, rateScore } from '@speedlab/shared/thresholds';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

export function Card({ className, children, hover = false, ...rest }) {
  return (
    <div className={cx('card animate-fade-up', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function IconChip({ icon: Icon, tone = 'brand', size = 16, className }) {
  const tones = {
    brand: 'from-brand-500 to-violet-600 shadow-brand-500/30',
    green: 'from-emerald-400 to-teal-600 shadow-emerald-500/30',
    amber: 'from-amber-400 to-orange-500 shadow-amber-500/30',
    red: 'from-rose-500 to-red-600 shadow-rose-500/30',
    blue: 'from-sky-400 to-blue-600 shadow-sky-500/30',
    pink: 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30',
  };
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br p-2 text-white shadow-lg', tones[tone] || tones.brand, className)}>
      <Icon size={size} />
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, className }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <IconChip icon={Icon} size={15} className="mt-0.5 p-1.5" />}
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BTN = {
  primary: 'bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-600/25 hover:shadow-lg hover:shadow-brand-600/35 hover:brightness-110 active:scale-[0.98]',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]',
  white: 'bg-white text-brand-700 shadow-lg shadow-black/10 hover:bg-brand-50 active:scale-[0.98]',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-outline': 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10',
};

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, ...rest }) {
  const sz = size === 'sm' ? 'px-2.5 py-1.5 text-xs gap-1.5' : size === 'lg' ? 'px-5 py-3 text-sm gap-2' : 'px-3.5 py-2 text-sm gap-2';
  return (
    <button
      type="button"
      className={cx('inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50', sz, BTN[variant], className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 13 : 16} /> : null}
      {children}
    </button>
  );
}

export function Badge({ tone = 'slate', className, children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export const RATING_TONE = { good: 'green', 'needs-improvement': 'amber', poor: 'red', unavailable: 'slate' };
export const RATING_LABEL = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor', unavailable: 'Unavailable' };
export const RATING_COLOR = { good: '#0cce6b', 'needs-improvement': '#ffa400', poor: '#ff4e42', unavailable: '#94a3b8' };

export function RatingBadge({ rating, metric, value }) {
  const r = rating || (metric ? rateMetric(metric, value) : 'unavailable');
  return <Badge tone={RATING_TONE[r]}>{RATING_LABEL[r]}</Badge>;
}

export function scoreRating(score) {
  return rateScore(score);
}

const PRIORITY_TONE = { critical: 'red', high: 'orange', medium: 'amber', low: 'blue' };
export function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <Badge tone={PRIORITY_TONE[priority]} className="capitalize">{priority}</Badge>;
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-lg bg-slate-200/80 dark:bg-slate-800', className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/40 px-6 py-14 text-center dark:border-white/10 dark:bg-white/[0.02]', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-brand-500/30 blur-xl" />
        <IconChip icon={Icon} size={22} className="relative animate-float p-3" />
      </div>
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {message && <p className="mt-0.5 break-words">{message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children, className }) {
  const t = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
  };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm', t[tone], className)}>
      {tone === 'warn' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1 dark:border-white/[0.06] dark:bg-white/[0.04]', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === t.key ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-white dark:ring-white/10' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, className, ...rest }) {
  return (
    <select className={cx('input w-auto py-2 pr-8', className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }) {
  const color = tone === 'brand' ? 'bg-brand-600' : tone;
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon: Icon, accent = 'brand' }) {
  const bar = { brand: 'from-brand-500 to-violet-500', green: 'from-emerald-400 to-teal-500', amber: 'from-amber-400 to-orange-500', red: 'from-rose-500 to-red-500', blue: 'from-sky-400 to-blue-500', pink: 'from-fuchsia-500 to-pink-500' };
  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className={cx('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r', bar[accent] || bar.brand)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && <Icon size={16} className="text-slate-300 dark:text-slate-600" />}
      </div>
      <p className={cx('mt-1.5 text-2xl font-bold tabular-nums tracking-tight', tone || 'text-slate-900 dark:text-white')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function KeyValue({ items, className }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2', className)}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="flex min-w-0 justify-between gap-3 border-b border-dashed border-slate-200 pb-2 dark:border-slate-800">
          <dt className="shrink-0 text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="min-w-0 truncate text-right font-medium text-slate-800 dark:text-slate-200" title={typeof v === 'string' ? v : undefined}>
            {v ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Collapsible({ title, defaultOpen = false, children, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0 font-medium text-slate-800 dark:text-slate-100">{title}</span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, icon: Icon, eyebrow = 'SpeedLab Pro' }) {
  return (
    <div className="mb-6 flex animate-fade-up flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && <IconChip icon={Icon} size={22} className="hidden p-2.5 sm:flex" />}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">{eyebrow}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px] dark:text-white">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SourceTag({ kind }) {
  const map = {
    lab: ['Lab data', 'violet', 'Measured in a single simulated page load (Lighthouse).'],
    field: ['Field data', 'green', 'Real-user data from the Chrome UX Report (75th percentile, last 28 days).'],
    measured: ['Measured', 'blue', 'Measured directly by SpeedLab Pro during this scan.'],
    estimate: ['Estimate', 'amber', 'An estimate – actual savings depend on implementation.'],
    lighthouse: ['Lighthouse estimate', 'amber', 'Savings estimated by Lighthouse.'],
    unavailable: ['Unavailable', 'slate', 'This data was not returned for this scan.'],
  };
  const [label, tone, title] = map[kind] || map.unavailable;
  return (
    <span title={title}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('animate-spin', className)} size={18} />;
}
