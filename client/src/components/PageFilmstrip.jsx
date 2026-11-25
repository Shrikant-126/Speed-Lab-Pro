// Visual load: the final Lighthouse screenshot in a device frame, and the filmstrip of frames
// captured while the page loaded, with FCP / LCP marked. Works for mobile and desktop reports.
import { useEffect, useState } from 'react';
import { Film, Smartphone, Monitor, X } from 'lucide-react';
import { Card, CardHeader, Tabs, cx } from './ui.jsx';

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return u || 'the page';
  }
};
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Final screenshot for a report; older reports fall back to the LCP-analysis screenshot. */
export function finalShotOf(report) {
  return report?.visual?.finalScreenshot?.data || report?.lcp?.screenshot?.data || null;
}

/** The page as it looked at the end of the run, in a phone or browser frame. */
export function DeviceShot({ report, className }) {
  const src = finalShotOf(report);
  if (!src) return null;
  const desktop = report.strategy === 'desktop';
  return (
    <figure className={cx('flex flex-col items-center', className)}>
      {desktop ? (
        <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-white/15 bg-[#0d1416] shadow-2xl shadow-black/40">
          <div className="flex items-center gap-1 border-b border-white/10 px-2.5 py-1.5">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <img src={src} alt="Final desktop screenshot captured by Lighthouse" className="block w-full" />
        </div>
      ) : (
        <div className="w-[150px] rounded-[1.6rem] border border-white/15 bg-[#0d1416] p-1.5 shadow-2xl shadow-black/40">
          <div className="overflow-hidden rounded-[1.25rem]">
            <img src={src} alt="Final mobile screenshot captured by Lighthouse" className="block w-full" />
          </div>
        </div>
      )}
      <figcaption className="mt-2 text-[11px] text-white/55">{desktop ? 'Desktop' : 'Mobile'} · final screenshot</figcaption>
    </figure>
  );
}

function Lightbox({ frame, label, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute -right-2 -top-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
          <X size={16} />
        </button>
        <img src={frame.data} alt={label} className="max-h-[80vh] w-auto rounded-xl shadow-2xl" />
        <p className="mt-2 text-center text-sm text-white/80">{label}</p>
      </div>
    </div>
  );
}

function Strip({ report }) {
  const [open, setOpen] = useState(null);
  const frames = report.visual?.filmstrip || [];
  const desktop = report.strategy === 'desktop';
  if (!frames.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/10">
        No filmstrip in this {report.strategy} report. Run a new scan (Retest) to capture the page-load frames.
      </p>
    );
  }
  const fcp = report.lab?.fcp?.value;
  const lcp = report.lab?.lcp?.value;
  // A frame "shows" a milestone when it is the first frame at or after that time.
  const firstAt = (t) => (typeof t === 'number' ? frames.findIndex((f) => f.timing >= t) : -1);
  const fcpIdx = firstAt(fcp);
  const lcpIdx = firstAt(lcp);
  const label = (f) => `${report.strategy} · ${sec(f.timing)}`;
  return (
    <>
      <div className="-mx-1 overflow-x-auto pb-2">
        <ol className={cx('grid gap-2 px-1', desktop ? 'min-w-[880px]' : 'min-w-[640px]')} style={{ gridTemplateColumns: `repeat(${frames.length}, minmax(0, 1fr))` }}>
          {frames.map((f, i) => {
            const tags = [i === fcpIdx && 'FCP', i === lcpIdx && 'LCP'].filter(Boolean);
            const highlighted = tags.length > 0;
            return (
              <li key={f.timing} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpen(f)}
                  className={cx(
                    'group relative block w-full overflow-hidden rounded-lg border bg-white transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                    highlighted ? 'border-brand-400 ring-1 ring-brand-400/60' : 'border-slate-200 dark:border-white/10',
                  )}
                  aria-label={`Open frame at ${sec(f.timing)}`}
                >
                  <img src={f.data} alt="" loading="lazy" className="block w-full" />
                  {highlighted && (
                    <span className="absolute left-1 top-1 flex gap-1">
                      {tags.map((t) => (
                        <span key={t} className="rounded bg-brand-400 px-1 py-0.5 text-[9px] font-bold uppercase text-[#04090a]">{t}</span>
                      ))}
                    </span>
                  )}
                </button>
                <p className="mt-1 text-center text-[11px] tabular-nums text-slate-500">{sec(f.timing)}</p>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        {typeof fcp === 'number' && <span>First Contentful Paint · <b className="text-slate-700 dark:text-slate-200">{sec(fcp)}</b></span>}
        {typeof lcp === 'number' && <span>Largest Contentful Paint · <b className="text-slate-700 dark:text-slate-200">{sec(lcp)}</b></span>}
        {typeof report.lab?.si?.value === 'number' && <span>Speed Index · <b className="text-slate-700 dark:text-slate-200">{sec(report.lab.si.value)}</b></span>}
        <span className="text-slate-400">Click a frame to enlarge</span>
      </div>
      {open && <Lightbox frame={open} label={label(open)} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Filmstrip card with a Mobile / Desktop switch when both reports are loaded. */
export default function PageFilmstrip({ report, reports }) {
  const available = ['mobile', 'desktop'].filter((k) => reports?.[k]);
  const [device, setDevice] = useState(report.strategy);
  useEffect(() => setDevice(report.strategy), [report.strategy, report.id]);
  const shown = reports?.[device] || report;
  return (
    <Card>
      <CardHeader
        icon={Film}
        title="Page load filmstrip"
        subtitle={`How ${hostOf(shown.finalUrl)} rendered over time · ${shown.strategy} (Lighthouse)`}
        actions={
          available.length > 1 ? (
            <Tabs
              tabs={available.map((k) => ({ key: k, label: k === 'mobile' ? 'Mobile' : 'Desktop' }))}
              value={device}
              onChange={setDevice}
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm capitalize text-slate-500">
              {shown.strategy === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />} {shown.strategy}
            </span>
          )
        }
      />
      <div className="p-5">
        <Strip key={shown.strategy} report={shown} />
      </div>
    </Card>
  );
}
