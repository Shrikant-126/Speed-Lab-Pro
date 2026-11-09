import { rateScore } from '@speedlab/shared/thresholds';
import { RATING_COLOR } from './ui.jsx';

export default function ScoreGauge({ score, label, size = 112 }) {
  const rating = rateScore(score);
  const color = RATING_COLOR[rating];
  const stroke = size * 0.085;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = typeof score === 'number' ? score / 100 : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score ?? 'unavailable'}`}>
        <div className="absolute inset-[18%] rounded-full opacity-25 blur-xl" style={{ background: color }} />
        <svg width={size} height={size} className="relative -rotate-90" style={{ filter: `drop-shadow(0 4px 10px ${color}55)` }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200/80 dark:stroke-white/[0.07]" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 800ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-extrabold tabular-nums tracking-tight" style={{ color, fontSize: size * 0.3 }}>
            {typeof score === 'number' ? score : '—'}
          </span>
        </div>
      </div>
      {label && <span className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>}
    </div>
  );
}
