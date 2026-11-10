// Live scan meter: speedometer with a moving needle, radar sweep, elapsed timer and stage list.
// Uses real job progress when the worker reports it; in Online (Lite) mode the scan runs in a
// single request, so progress is time-based and clearly labelled as an estimate.
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import { cx } from './ui.jsx';

const EST_STAGES = [
  { at: 0, label: 'Validating URL & security checks' },
  { at: 2, label: 'Running Lighthouse via PageSpeed Insights' },
  { at: 6, label: 'Fetching Chrome UX Report real-user data' },
  { at: 9, label: 'Measuring server, TTFB, SEO, robots.txt & sitemap' },
  { at: 22, label: 'Analysing images with Sharp' },
  { at: 35, label: 'Building diagnostics & recommendations' },
];
const EXPECTED_SECONDS = 45;

function useElapsed(startedAt, running) {
  const start = startedAt ? Date.parse(startedAt) : Date.now();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  return Math.max(0, (now - start) / 1000);
}

export default function ScanMeter({ job }) {
  const running = ['queued', 'running'].includes(job.status);
  const elapsed = useElapsed(job.startedAt || job.createdAt, running);
  const estimated = !job.steps?.length;
  // Ease towards 95 % so the needle keeps moving but never claims to be finished.
  const estPct = Math.min(95, 95 * (1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2.2))));
  const pct = job.status === 'done' ? 100 : estimated ? estPct : Math.max(job.progress || 0, 2);
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  // Speedometer geometry (240° arc)
  const size = 220;
  const cx0 = size / 2;
  const cy0 = size / 2 + 8;
  const r = 86;
  const startDeg = 150;
  const sweep = 240;
  const polar = (deg, rad = r) => [cx0 + rad * Math.cos((deg * Math.PI) / 180), cy0 + rad * Math.sin((deg * Math.PI) / 180)];
  const arc = (a, b) => {
    const [x1, y1] = polar(a);
    const [x2, y2] = polar(b);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const needleDeg = startDeg + (sweep * pct) / 100;
  const [nx, ny] = polar(needleDeg, r - 18);
  const ticks = Array.from({ length: 25 }, (_, i) => startDeg + (sweep * i) / 24);

  const stageIndex = EST_STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
  const steps = estimated
    ? EST_STAGES.map((s, i) => ({ key: s.label, label: s.label, status: i < stageIndex ? 'done' : i === stageIndex ? 'running' : 'pending' }))
    : job.steps;
  const current = steps.find((s) => s.status === 'running')?.label || (job.status === 'done' ? 'Complete' : 'Starting…');

  return (
    <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
      <div className="relative mx-auto" style={{ width: size, height: size - 20 }}>
        {running && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ top: 8 }}>
            <div className="h-44 w-44 animate-spin rounded-full motion-reduce:animate-none" style={{ animationDuration: '2.4s', background: 'conic-gradient(from 0deg, transparent 0deg, rgb(194 238 42 / 0.22) 50deg, transparent 90deg)' }} />
          </div>
        )}
        <svg width={size} height={size - 20} className="relative overflow-visible">
          <defs>
            <linearGradient id="meterGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor="#d1f74f" />
            </linearGradient>
            <filter id="meterGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>
          {ticks.map((d, i) => {
            const [x1, y1] = polar(d, r + 12);
            const [x2, y2] = polar(d, r + (i % 4 === 0 ? 20 : 16));
            return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={i % 4 === 0 ? 2 : 1} className={d <= needleDeg ? 'stroke-brand-400' : 'stroke-slate-300 dark:stroke-white/15'} />;
          })}
          <path d={arc(startDeg, startDeg + sweep)} fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-slate-200 dark:stroke-white/[0.07]" />
          {pct > 0.5 && (
            <>
              <path d={arc(startDeg, needleDeg)} fill="none" stroke="url(#meterGrad)" strokeWidth="12" strokeLinecap="round" opacity="0.6" filter="url(#meterGlow)" />
              <path d={arc(startDeg, needleDeg)} fill="none" stroke="url(#meterGrad)" strokeWidth="12" strokeLinecap="round" style={{ transition: 'all 300ms linear' }} />
            </>
          )}
          <line x1={cx0} y1={cy0} x2={nx} y2={ny} stroke="#d1f74f" strokeWidth="3.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(209,247,79,.8))', transition: 'all 300ms linear' }} />
          <circle cx={cx0} cy={cy0} r="9" className="fill-white dark:fill-[#04090a]" stroke="#d1f74f" strokeWidth="3" />
        </svg>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: cy0 + 18 }}>
          <span className="num text-4xl text-slate-900 dark:text-white">{Math.round(pct)}<span className="text-lg text-slate-400">%</span></span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{estimated && running ? 'Estimated' : job.status === 'done' ? 'Done' : 'Progress'}</span>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-400" /></span>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          )}
          <p className="font-semibold text-slate-900 dark:text-white">{running ? 'Scanning your site…' : job.status === 'done' ? 'Scan complete' : job.status}</p>
          <span className="num rounded-lg bg-slate-100 px-2 py-0.5 text-sm text-slate-700 dark:bg-white/[0.06] dark:text-slate-200">⏱ {mmss}</span>
        </div>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400" title={job.url}>{job.url}</p>
        <p className="text-sm text-brand-700 dark:text-brand-300">{current}</p>
        <ul className="space-y-1.5">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              {s.status === 'done' ? <CheckCircle2 size={16} className="text-emerald-500" /> : s.status === 'running' ? <Loader2 size={16} className="animate-spin text-brand-500" /> : <Circle size={16} className="text-slate-300 dark:text-white/15" />}
              <span className={cx(s.status === 'pending' && 'text-slate-400', s.status === 'running' && 'font-medium text-slate-900 dark:text-white')}>{s.label}</span>
              {s.status === 'skipped' && <span className="text-xs text-slate-400">(not available)</span>}
            </li>
          ))}
        </ul>
        {estimated && running && elapsed > 75 && <p className="text-xs text-amber-600 dark:text-amber-400">Taking longer than usual – PageSpeed Insights can need up to 2 minutes for heavy pages.</p>}
      </div>
    </div>
  );
}
