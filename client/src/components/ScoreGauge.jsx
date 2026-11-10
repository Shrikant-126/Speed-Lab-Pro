// Arc gauge with gradient stroke and a glowing knob (inspired by fitness-dashboard rings).
import { useId } from 'react';
import { rateScore } from '@speedlab/shared/thresholds';

const GRADIENTS = {
  good: ['#d1f74f', '#0cce6b'],
  'needs-improvement': ['#ffe066', '#ffa400'],
  poor: ['#ff9a62', '#ff4e42'],
  unavailable: ['#94a3b8', '#64748b'],
};

export default function ScoreGauge({ score, label, size = 112, sweep = 270, suffix }) {
  const uid = useId().replace(/:/g, '');
  const rating = rateScore(score);
  const [c1, c2] = GRADIENTS[rating];
  const stroke = Math.max(6, size * 0.075);
  const r = (size - stroke * 2.2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const start = 90 + (360 - sweep) / 2; // degrees, 0 = right, clockwise
  const pct = typeof score === 'number' ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const polar = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from, to) => {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const end = start + sweep * Math.max(pct, 0.0001);
  const [kx, ky] = polar(end);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label || 'Score'}: ${score ?? 'unavailable'}`}>
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={c2} />
              <stop offset="100%" stopColor={c1} />
            </linearGradient>
            <filter id={`f${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={stroke * 0.6} />
            </filter>
          </defs>
          <path d={arc(start, start + sweep)} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-slate-200 dark:stroke-white/[0.08]" />
          {pct > 0 && (
            <>
              <path d={arc(start, end)} fill="none" stroke={`url(#g${uid})`} strokeWidth={stroke} strokeLinecap="round" opacity="0.55" filter={`url(#f${uid})`} />
              <path d={arc(start, end)} fill="none" stroke={`url(#g${uid})`} strokeWidth={stroke} strokeLinecap="round" />
              <circle cx={kx} cy={ky} r={stroke * 1.05} fill={c1} opacity="0.35" filter={`url(#f${uid})`} />
              <circle cx={kx} cy={ky} r={stroke * 0.95} fill="#ffffff" stroke={c1} strokeWidth={stroke * 0.3} />
              <circle cx={kx} cy={ky} r={stroke * 0.32} fill={c2} />
            </>
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num leading-none text-slate-900 dark:text-white" style={{ fontSize: size * 0.3 }}>
            {typeof score === 'number' ? score : '—'}
            {suffix && typeof score === 'number' && <span className="ml-0.5 text-slate-400" style={{ fontSize: size * 0.13 }}>{suffix}</span>}
          </span>
          <span className="mt-1 h-1 w-1 rounded-full" style={{ background: c1, boxShadow: `0 0 8px ${c1}` }} />
        </div>
      </div>
      {label && <span className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>}
    </div>
  );
}
