// Plain-language, per-image to-do list: optimize or leave it, to what size, and how much it saves.
import { useState } from 'react';
import { ListChecks, CheckCircle2, ArrowRight, Wand2, ChevronDown, ChevronUp, Maximize2, FileImage, Code2, Download, Loader2, AlertTriangle } from 'lucide-react';
import { formatBytes, fileName, shortUrl } from '@speedlab/shared/format';
import { api, downloadBlob } from '../lib/api.js';
import { Card, CardHeader, Badge, Button, Notice, cx } from './ui.jsx';

const canDownload = (x) => x.plan.verdict === 'optimize' && x.img.format !== 'svg' && x.img.format !== 'gif';

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Convert one scanned image on the server at the recommended width; returns the smallest output. */
async function optimizeOne(img, plan) {
  const { results } = await api('/images/convert-url', {
    method: 'POST',
    body: { url: img.url, options: { formats: ['webp', 'original'], quality: { webp: 78, avif: 50, jpeg: 80, png: 100 }, widths: plan.targetWidth ? String(plan.targetWidth) : '' } },
  });
  const r = results?.[0];
  if (!r || r.error) throw new Error(r?.error || 'Conversion failed');
  const best = [...r.outputs].sort((a, b) => a.bytes - b.bytes)[0];
  if (!best) throw new Error('No output');
  return { ...best, inputBytes: r.input?.bytes ?? null, inputWidth: r.input?.width ?? null, inputHeight: r.input?.height ?? null };
}

const STEP_ICON = { resize: Maximize2, format: FileImage, compress: FileImage, markup: Code2 };

function Thumb({ url }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
      <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    </div>
  );
}

function RowStatus({ st }) {
  if (!st) return null;
  if (st.state === 'working') return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Optimizing…</span>;
  if (st.state === 'error') return <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertTriangle size={13} /> {st.error}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={13} /> {st.file.filename} · {st.file.width}×{st.file.height} · {formatBytes(st.file.bytes)}
      {st.file.inputBytes ? ` (was ${formatBytes(st.file.inputBytes)})` : ''}
    </span>
  );
}

function PlanRow({ img, plan, index, onConvert, onDetails, selectable, checked, onCheck, status }) {
  return (
    <li className={cx('rounded-xl border p-4', checked ? 'border-brand-400 bg-brand-400/[0.04]' : 'border-slate-200 dark:border-slate-700/70')}>
      <div className="flex flex-wrap items-start gap-3">
        {selectable ? (
          <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500" aria-label={`Select ${fileName(img.url)} for download`} />
        ) : (
          <span className="w-4 shrink-0" />
        )}
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
      <ol className="mt-3 space-y-2 pl-16">
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
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-16">
        {plan.verdict === 'optimize' && img.format !== 'svg' && (
          <Button size="sm" icon={Wand2} onClick={() => onConvert(img.url, plan.targetWidth)}>{plan.targetWidth ? `Optimize now (resize to ${plan.targetWidth}px + WebP)` : 'Optimize this image now'}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => onDetails(img.url)}>Show code</Button>
        <RowStatus st={status} />
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
  const downloadable = todo.filter(canDownload);
  const [checked, setChecked] = useState(() => new Set());
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const selected = downloadable.filter((x) => checked.has(x.img.url));
  const allOn = downloadable.length > 0 && selected.length === downloadable.length;
  const setOne = (url, on) => setChecked((prev) => {
    const n = new Set(prev);
    if (on) n.add(url);
    else n.delete(url);
    return n;
  });

  const downloadSelected = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    setMsg(null);
    const files = [];
    for (const x of selected) {
      setStatus((s) => ({ ...s, [x.img.url]: { state: 'working' } }));
      try {
        const file = await optimizeOne(x.img, x.plan);
        files.push({ x, file });
        setStatus((s) => ({ ...s, [x.img.url]: { state: 'done', file } }));
      } catch (e) {
        setStatus((s) => ({ ...s, [x.img.url]: { state: 'error', error: e.message } }));
      }
    }
    try {
      if (files.length === 1) {
        const f = files[0].file;
        downloadBlob(new Blob([b64ToBytes(f.data)], { type: f.mime }), f.filename);
      } else if (files.length > 1) {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const used = new Set();
        const lines = ['SpeedLab - optimized images (recommended size, WebP or recompressed original)', ''];
        for (const { x, file } of files) {
          let name = file.filename;
          for (let i = 2; used.has(name); i += 1) name = file.filename.replace(/(\.[a-z0-9]+)$/i, `-${i}$1`);
          used.add(name);
          zip.file(name, b64ToBytes(file.data));
          lines.push(`${name}  ${file.width}x${file.height}  ${formatBytes(file.bytes)}${file.inputBytes ? `  (was ${formatBytes(file.inputBytes)}${file.inputWidth ? `, ${file.inputWidth}x${file.inputHeight}` : ''})` : ''}`);
          lines.push(`  replaces: ${x.img.url}`, '');
        }
        zip.file('README.txt', lines.join('\n'));
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'optimized-images.zip');
      }
      const failed = selected.length - files.length;
      setMsg(files.length
        ? { tone: failed ? 'warn' : 'info', text: `Downloaded ${files.length} optimized image${files.length === 1 ? '' : 's'}${failed ? ` · ${failed} failed (see the red message on each image)` : ''}. Upload them to replace the originals (in WordPress keep the same file name with a plugin like "Enable Media Replace"), then Retest.` }
        : { tone: 'warn', text: 'No image could be optimized. See the message on each image.' });
    } finally {
      setBusy(false);
    }
  };

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
        {downloadable.length > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-700/70 dark:bg-[#0b1214]/95">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={allOn} onChange={(e) => setChecked(e.target.checked ? new Set(downloadable.map((x) => x.img.url)) : new Set())} className="h-4 w-4 accent-brand-500" />
              Select all ({downloadable.length})
            </label>
            <span className="text-xs text-slate-500">{selected.length ? `${selected.length} selected · resized to the recommended size, WebP (or recompressed original if smaller)` : 'Tick images to download them optimized'}</span>
            <Button size="sm" icon={busy ? Loader2 : Download} disabled={!selected.length || busy} onClick={downloadSelected} className={cx('ml-auto', busy && '[&_svg]:animate-spin')}>
              {busy ? 'Optimizing…' : selected.length > 1 ? `Download ${selected.length} as ZIP` : 'Download selected'}
            </Button>
          </div>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {todo.length > 0 && (
          <ol className="space-y-3">
            {todo.map((x, i) => (
              <PlanRow
                key={x.img.url}
                img={x.img}
                plan={x.plan}
                index={i + 1}
                onConvert={onConvert}
                onDetails={onDetails}
                selectable={canDownload(x)}
                checked={checked.has(x.img.url)}
                onCheck={(on) => setOne(x.img.url, on)}
                status={status[x.img.url]}
              />
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
