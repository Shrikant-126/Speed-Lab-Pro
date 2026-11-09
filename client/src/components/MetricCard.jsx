import { METRICS, rateMetric } from '@speedlab/shared/thresholds';
import { formatMetric } from '@speedlab/shared/format';
import { RatingBadge, RATING_COLOR, SourceTag, cx } from './ui.jsx';

/** Shows a single metric value with rating, threshold bar and data-source tag. */
export default function MetricCard({ metric, value, source = 'lab', compact = false, note }) {
  const m = METRICS[metric];
  const rating = rateMetric(metric, value);
  const max = m.poor * 1.5;
  const pos = typeof value === 'number' ? Math.min(100, (value / max) * 100) : null;
  return (
    <div className="card card-hover relative flex flex-col overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${RATING_COLOR[rating]}, ${RATING_COLOR[rating]}55)` }} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.08] blur-2xl" style={{ background: RATING_COLOR[rating] }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{m.short}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{m.label}</p>
        </div>
        <SourceTag kind={value === null || value === undefined ? 'unavailable' : source} />
      </div>
      <p className={cx('mt-3 font-extrabold tabular-nums tracking-tight', compact ? 'text-[28px]' : 'text-4xl')} style={{ color: RATING_COLOR[rating] }}>
        {formatMetric(metric, value)}
      </p>
      <div className="mt-1">
        <RatingBadge rating={rating} />
      </div>
      <div className="relative mt-4">
        <div className="flex h-1.5 overflow-hidden rounded-full">
          <div className="bg-[#0cce6b]" style={{ width: `${(m.good / max) * 100}%` }} />
          <div className="bg-[#ffa400]" style={{ width: `${((m.poor - m.good) / max) * 100}%` }} />
          <div className="flex-1 bg-[#ff4e42]" />
        </div>
        {pos !== null && <div className="absolute -top-1 h-3.5 w-1 rounded bg-slate-900 dark:bg-white" style={{ left: `calc(${pos}% - 2px)` }} />}
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
          <span>Good ≤ {formatMetric(metric, m.good)}</span>
          <span>Poor &gt; {formatMetric(metric, m.poor)}</span>
        </div>
      </div>
      {note && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  );
}
