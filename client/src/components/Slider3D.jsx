// 3D coverflow slider: the active card faces the user, neighbours rotate away in perspective.
// Supports arrows, dots, keyboard (←/→), drag/swipe and respects reduced motion.
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui.jsx';

export default function Slider3D({ items, renderItem, height = 300, cardWidth = 300, initial = 0, label = 'Slider' }) {
  const [active, setActive] = useState(Math.min(initial, items.length - 1));
  const drag = useRef(null);
  const go = (i) => setActive(Math.max(0, Math.min(items.length - 1, i)));

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, moved: false };
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
    drag.current = null;
  };

  return (
    <div
      className="relative select-none outline-none"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(active + 1);
        if (e.key === 'ArrowLeft') go(active - 1);
      }}
    >
      <div
        className="relative mx-auto touch-pan-y overflow-hidden"
        style={{ height, perspective: 1400 }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (drag.current = null)}
      >
        {items.map((item, i) => {
          const off = i - active;
          const abs = Math.abs(off);
          const hidden = abs > 2;
          return (
            <div
              key={item.key ?? i}
              aria-hidden={off !== 0}
              onClick={() => off !== 0 && go(i)}
              className={cx('absolute left-1/2 top-1/2 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none', off !== 0 && 'cursor-pointer')}
              style={{
                width: cardWidth,
                transform: `translate(-50%, -50%) translateX(${off * cardWidth * 0.82}px) translateZ(${-abs * 140}px) rotateY(${off * -26}deg) scale(${1 - abs * 0.08})`,
                zIndex: 10 - abs,
                opacity: hidden ? 0 : 1 - abs * 0.3,
                pointerEvents: hidden ? 'none' : 'auto',
                filter: off === 0 ? 'none' : `saturate(${1 - abs * 0.25}) brightness(${1 - abs * 0.12})`,
              }}
            >
              {renderItem(item, off === 0)}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(active - 1)} disabled={active === 0} className="glass rounded-full p-2 text-slate-700 transition hover:scale-105 disabled:opacity-30 dark:text-white" aria-label="Previous">
          <ChevronLeft size={18} />
        </button>
        <div className="flex gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.key ?? i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${item.label ?? i + 1}`}
              className={cx('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-brand-400 shadow-[0_0_10px_rgba(194,238,42,.7)]' : 'w-1.5 bg-slate-300 dark:bg-white/20')}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(active + 1)} disabled={active === items.length - 1} className="glass rounded-full p-2 text-slate-700 transition hover:scale-105 disabled:opacity-30 dark:text-white" aria-label="Next">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
