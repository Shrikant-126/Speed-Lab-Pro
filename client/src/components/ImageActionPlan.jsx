// Plain-language, per-image to-do list: optimize or leave it, to what size, and how much it saves.
import { useState } from 'react';
import { ListChecks, CheckCircle2, ArrowRight, Wand2, ChevronDown, ChevronUp, Maximize2, FileImage, Code2 } from 'lucide-react';
import { formatBytes, fileName, shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Badge, Button, cx } from './ui.jsx';

const STEP_ICON = { resize: Maximize2, format: FileImage, compress: FileImage, markup: Code2 };

function Thumb({ url }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
      <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    </div>
  );
}

function PlanRow({ img, plan, index, onConvert, onDetails }) {
  return (
    <li className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/70">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-xs font-bold text-[#04090a]">{index}</span>
        <Thumb url={img.url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold text-slate-900 dark:text-white" title={img.url}>{fileName(img.url)}</p>
            {img.isLcp && <Badge tone="red">LCP</Badge>}
            {plan.verdict === 'optimize' ? <Badge tone="amber">Optimize</Badge> : <Badge tone="blue">Fix HTML only</Badge>}
          </div>
          <p className="truncate text-xs text-slate-400">{shortUrl(img.url, 60)}</p>
        </div>
        {plan.savingsBytes > 0 && plan.currentBytes ? (
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-sm tabular-nums">
              <span className="text-slate-500 line-through">{formatBytes(plan.currentBytes)}</span>
              <ArrowRight size={13} className="text-slate-400" />
              <b className="text-emerald-600 dark:text-emerald-400">≈ {formatBytes(plan.targetBytes)}</b>
            </p>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">saves {formatBytes(plan.savingsBytes)} ({plan.savingsPct}%)</p>
          </div>
        ) : null}
      </div>
      <ol className="mt-3 space-y-2 pl-9">
        {plan.steps.map((s, i) => {
          const Icon = STEP_ICON[s.kind] || Code2;
          return (
            <li key={i} className="flex gap-2.5 text-sm">
              <Icon size={15} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-100">{s.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2 pl-9">
        {plan.verdict === 'optimize' && img.format !== 'svg' && (
          <Button size="sm" icon={Wand2} onClick={() => onConvert(img.url, plan.targetWidth)}>{plan.targetWidth ? `Optimize now (resize to ${plan.targetWidth}px + WebP)` : 'Optimize this image now'}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => onDetails(img.url)}>Show code</Button>
      </div>
    </li>
  );
}

export default function ImageActionPlan({ items, totalBytes, onConvert, onDetails }) {
  const [showOk, setShowOk] = useState(false);
  const todo = items.filter((x) => x.plan.verdict !== 'ok');
  const ok = items.filter((x) => x.plan.verdict === 'ok');
  const saving = todo.reduce((s, x) => s + (x.plan.savingsBytes || 0), 0);
  const optimizeCount = todo.filter((x) => x.plan.verdict === 'optimize').length;

  return (
    <Card>
      <CardHeader
        icon={ListChecks}
        title="What to do — image by image"
        subtitle={todo.length
          ? `${optimizeCount} image${optimizeCount === 1 ? '' : 's'} to optimize${todo.length > optimizeCount ? ` · ${todo.length - optimizeCount} HTML fix${todo.length - optimizeCount === 1 ? '' : 'es'}` : ''} · ${ok.length} already fine`
          : 'Nothing to do — every image is already optimized'}
      />
      <div className="space-y-4 p-5">
        {todo.length > 0 && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
            Do the steps below, biggest saving first. Total download goes from <b>{formatBytes(totalBytes)}</b> to about{' '}
            <b>{formatBytes(Math.max(0, totalBytes - saving))}</b> — <b>{formatBytes(saving)} less</b>
            {totalBytes ? ` (${Math.round((saving / totalBytes) * 100)}% smaller)` : ''}. That speeds up LCP, FCP and Speed Index, mostly on mobile.
          </div>
        )}
        {todo.length > 0 && (
          <ol className="space-y-3">
            {todo.map((x, i) => (
              <PlanRow key={x.img.url} img={x.img} plan={x.plan} index={i + 1} onConvert={onConvert} onDetails={onDetails} />
            ))}
          </ol>
        )}
        {ok.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/70">
            <button type="button" onClick={() => setShowOk((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <CheckCircle2 size={16} className="text-emerald-500" />
                {ok.length} image{ok.length === 1 ? ' is' : 's are'} fine — no change needed
              </span>
              {showOk ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showOk && (
              <ul className={cx('grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700/70')}>
                {ok.map(({ img }) => (
                  <li key={img.url} className="flex items-center gap-2 text-xs">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <img src={img.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    </div>
                    <span className="truncate text-slate-600 dark:text-slate-300" title={img.url}>{fileName(img.url)}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-slate-400">{formatBytes(img.transferSize)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
