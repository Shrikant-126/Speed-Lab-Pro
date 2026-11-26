// "Why is this metric slow?" – per metric, the elements/resources Lighthouse blamed, cropped out
// of the Lighthouse screenshot with the element outlined, plus the cause and the fix.
import { useEffect, useState } from 'react';
import { Stethoscope, Wrench, X, ImageOff, FileCode2 } from 'lucide-react';
import { METRICS, rateMetric } from '@speedlab/shared/thresholds';
import { formatMetric, shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Tabs, RatingBadge, Notice, Badge, cx } from './ui.jsx';

const TABS = [
  { key: 'cls', field: 'cls', lab: 'cls', label: 'CLS' },
  { key: 'lcp', field: 'lcp', lab: 'lcp', label: 'LCP' },
  { key: 'tbt', field: 'inp', lab: 'tbt', label: 'INP / TBT' },
  { key: 'fcp', field: 'fcp', lab: 'fcp', label: 'FCP' },
  { key: 'ttfb', field: 'ttfb', lab: 'ttfb', label: 'TTFB' },
];
const RANK = { poor: 0, 'needs-improvement': 1, good: 2, unavailable: 3 };

/** Crop of the Lighthouse screenshot around one element, with the element outlined. */
export function ElementShot({ shot, rect, maxW = 240, maxH = 170, pad = 24, onClick }) {
  if (!shot?.data || !rect) {
    return (
      <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 dark:border-white/10 sm:w-40">
        <ImageOff size={16} className="mr-1.5" /> Not in screenshot
      </div>
    );
  }
  const pageH = shot.height || rect.top + rect.height + pad;
  // Thin, wide elements (bars) get extra vertical context so the crop stays readable.
  const vPad = Math.max(pad, ((rect.width + pad * 2) / 2.6 - rect.height) / 2);
  const left = Math.max(0, rect.left - pad);
  const top = Math.max(0, rect.top - vPad);
  const right = Math.min(shot.width, rect.left + rect.width + pad);
  const bottom = Math.min(pageH, rect.top + rect.height + vPad);
  const cw = Math.max(1, right - left);
  const ch = Math.max(1, bottom - top);
  const s = Math.min(maxW / cw, maxH / ch, 2);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('relative block shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5', onClick && 'cursor-zoom-in transition hover:shadow-lg')}
      style={{ width: cw * s, height: ch * s }}
      aria-label={onClick ? 'Enlarge element screenshot' : undefined}
    >
      <img src={shot.data} alt="" className="absolute max-w-none" style={{ width: shot.width * s, left: -left * s, top: -top * s }} />
      <span
        className="pointer-events-none absolute rounded-sm border-2 border-[#ff4e42] bg-[#ff4e42]/15"
        style={{ left: (rect.left - left) * s, top: (rect.top - top) * s, width: rect.width * s, height: rect.height * s }}
      />
    </Tag>
  );
}

function Zoom({ shot, item, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const w = Math.min(window.innerWidth - 48, 900);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="relative max-h-full overflow-auto rounded-2xl bg-[#0d1416] p-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
          <X size={16} />
        </button>
        <p className="mb-3 pr-10 text-sm font-medium text-white">{item.title}</p>
        <ElementShot shot={shot} rect={item.element.rect} maxW={w} maxH={window.innerHeight * 0.7} pad={160} />
      </div>
    </div>
  );
}

function Culprit({ item, shot, index }) {
  const [zoom, setZoom] = useState(false);
  const isElement = !!item.element;
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 dark:border-white/[0.08] sm:flex-row">
      {isElement ? (
        <ElementShot shot={shot} rect={item.element.rect} onClick={item.element.rect ? () => setZoom(true) : undefined} />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/5">
          <FileCode2 size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
          <Badge tone="red">{item.cause.split(',')[0]}</Badge>
          {item.valueLabel && <Badge tone={item.valueLabel === 'risk' ? 'amber' : 'slate'}>{item.valueLabel === 'risk' ? 'can shift' : item.valueLabel}</Badge>}
        </div>
        <p className="mt-1.5 break-words font-medium text-slate-900 dark:text-white" title={item.title}>
          {/^https?:/.test(item.title) ? shortUrl(item.title) : item.title}
        </p>
        {item.element?.selector && <code className="mt-1 block truncate text-xs text-slate-500" title={item.element.selector}>{item.element.selector}</code>}
        {item.element?.snippet && <code className="mt-1 block truncate text-[11px] text-slate-400" title={item.element.snippet}>{item.element.snippet}</code>}
        {item.cause.includes(',') && <p className="mt-1.5 text-xs text-slate-500">Causes: {item.cause}</p>}
        {item.related?.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">
            {item.related.map((u) => (
              <li key={u} className="truncate" title={u}>↳ {shortUrl(u)}</li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 flex gap-2 rounded-xl bg-brand-400/10 p-2.5 text-sm text-slate-700 dark:text-slate-200">
          <Wrench size={15} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <span>{item.fix}</span>
        </p>
      </div>
      {zoom && <Zoom shot={shot} item={item} onClose={() => setZoom(false)} />}
    </li>
  );
}

export default function MetricDiagnosis({ report }) {
  const d = report.diagnosis;
  const ratingOf = (t) => {
    const f = report.field?.metrics?.[t.field];
    if (f && f.rating !== 'unavailable') return { rating: f.rating, value: f.p75, metric: t.field, src: 'real users' };
    const v = report.lab?.[t.lab]?.value ?? null;
    return { rating: rateMetric(t.lab, v), value: v, metric: t.lab, src: 'lab' };
  };
  const worst = [...TABS].sort((a, b) => RANK[ratingOf(a).rating] - RANK[ratingOf(b).rating])[0].key;
  const [tab, setTab] = useState(worst);
  useEffect(() => setTab(worst), [report.id, worst]);

  if (!d) {
    return (
      <Card>
        <CardHeader icon={Stethoscope} title="Why is each metric slow?" />
        <div className="p-5">
          <Notice>This report was created before element diagnosis was added. Press Retest to see which elements cause each problem, with screenshots.</Notice>
        </div>
      </Card>
    );
  }
  const t = TABS.find((x) => x.key === tab);
  const r = ratingOf(t);
  const m = d.metrics[tab] || { items: [] };
  return (
    <Card>
      <CardHeader
        icon={Stethoscope}
        title="Why is each metric slow?"
        subtitle={`Elements and files Lighthouse blamed · ${report.strategy}${d.screenshot?.kind === 'viewport' ? ' · only the first screen is visible in the screenshot' : ''}`}
        actions={
          <Tabs
            tabs={TABS.map((x) => {
              const rr = ratingOf(x);
              return { key: x.key, label: <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', rr.rating === 'poor' ? 'bg-[#ff4e42]' : rr.rating === 'needs-improvement' ? 'bg-[#ffa400]' : rr.rating === 'good' ? 'bg-[#0cce6b]' : 'bg-slate-400')} />{x.label}</span> };
            })}
            value={tab}
            onChange={setTab}
          />
        }
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900 dark:text-white">{METRICS[r.metric]?.label}</span>
          <span className="tabular-nums text-slate-600 dark:text-slate-300">{formatMetric(r.metric, r.value)}</span>
          <RatingBadge rating={r.rating} />
          <span className="text-xs text-slate-400">({r.src})</span>
        </div>
        {m.note && (
          <Notice tone="warn">
            {m.note}
          </Notice>
        )}
        {m.items.length ? (
          <ol className="space-y-3">
            {m.items.map((item, i) => (
              <Culprit key={`${item.title}-${i}`} item={item} shot={d.screenshot} index={i} />
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/10">
            Lighthouse found no {t.label} culprit in this {report.strategy} run.{report.strategy === 'mobile' ? ' Check the desktop report too.' : ' Check the mobile report too.'}
          </p>
        )}
      </div>
    </Card>
  );
}
