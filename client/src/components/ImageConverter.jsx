// Convert JPG/PNG/WebP/AVIF/GIF/BMP images (or an image from the scan) to WebP / AVIF /
// optimised JPEG / PNG, optionally at responsive widths.
// Images are converted IN THE BROWSER (Web Workers + WASM codecs from Squoosh): nothing is
// uploaded, so there is no file-size or file-count limit beyond the device's memory.
// Formats the browser cannot decode (e.g. TIFF in Chrome) fall back to the server (Sharp).

import { useEffect, useRef, useState } from 'react';
import { Upload, Wand2, Download, FileArchive, CheckCircle2, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { formatBytes } from '@speedlab/shared/format';
import { api, downloadBlob } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Notice, cx } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';

const FORMATS = [
  { key: 'webp', label: 'WebP', hint: 'Best compatibility, ~25–35% smaller than JPEG' },
  { key: 'avif', label: 'AVIF', hint: 'Smallest files, slower to encode' },
  { key: 'original', label: 'Optimized original', hint: 'Same format (JPEG/PNG), recompressed' },
  { key: 'jpeg', label: 'JPEG', hint: 'Convert to progressive mozjpeg' },
  { key: 'png', label: 'PNG', hint: 'Lossless PNG (OxiPNG optimised)' },
];
const PRESETS = [
  { label: 'Keep original size', value: '' },
  { label: 'Responsive: 480, 768, 1080, 1600', value: '480,768,1080,1600' },
  { label: 'Hero: 640, 960, 1280, 1920, 2400', value: '640,960,1280,1920,2400' },
  { label: 'Product: 360, 540, 720, 1080', value: '360,540,720,1080' },
  { label: 'Thumbnail: 150, 300', value: '150,300' },
];
let uid = 0;
let msgId = 0;
let pool = null;

/** A small pool of image workers (one per spare CPU core, max 4). */
function getPool() {
  if (!pool) {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    pool = Array.from({ length: n }, () => new Worker(new URL('../workers/imageWorker.js', import.meta.url), { type: 'module' }));
  }
  return pool;
}

function runInWorker(worker, buffer, name, options, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = (e) => {
      if (e.data?.id !== id) return;
      if (e.data.progress) return onProgress?.(e.data.progress);
      worker.removeEventListener('message', onMsg);
      worker.removeEventListener('error', onErr);
      return e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error));
    };
    const onErr = (e) => {
      worker.removeEventListener('message', onMsg);
      worker.removeEventListener('error', onErr);
      reject(new Error(e.message || 'Image worker crashed (the image may be too large for this device memory)'));
    };
    worker.addEventListener('message', onMsg);
    worker.addEventListener('error', onErr);
    worker.postMessage({ id, buffer, name, options }, [buffer]);
  });
}

const withUrls = (result) => ({
  ...result,
  outputs: result.outputs.map((o) => {
    const blob = o.blob || (o.buffer ? new Blob([o.buffer], { type: o.mime }) : b64ToBlob(o.data, o.mime));
    return { ...o, buffer: undefined, data: undefined, blob, url: URL.createObjectURL(blob) };
  }),
});
const revokeResult = (r) => r?.outputs?.forEach((o) => o.url && URL.revokeObjectURL(o.url));
const parseWidths = (w) => [...new Set(String(w || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 16 && x <= 20000))].slice(0, 8);

function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function pictureCode(result) {
  const outs = result.outputs;
  const byFmt = (f) => outs.filter((o) => o.format === f).sort((a, b) => a.width - b.width);
  const srcset = (list) => (list.length > 1 ? list.map((o) => `${o.filename} ${o.width}w`).join(', ') : list[0]?.filename);
  const fallbackFmt = ['jpeg', 'png'].find((f) => byFmt(f).length) || outs[0]?.format;
  const fallback = byFmt(fallbackFmt);
  const largest = fallback[fallback.length - 1] || outs[0];
  const multi = fallback.length > 1;
  const sizes = multi ? ' sizes="(min-width: 990px) 50vw, 100vw"' : '';
  const lines = ['<picture>'];
  if (byFmt('avif').length && fallbackFmt !== 'avif') lines.push(`  <source type="image/avif" srcset="${srcset(byFmt('avif'))}"${sizes}>`);
  if (byFmt('webp').length && fallbackFmt !== 'webp') lines.push(`  <source type="image/webp" srcset="${srcset(byFmt('webp'))}"${sizes}>`);
  lines.push(`  <img src="${largest.filename}"${multi ? ` srcset="${srcset(fallback)}"${sizes}` : ''} width="${largest.width}" height="${largest.height}" alt="" loading="lazy" decoding="async">`);
  lines.push('</picture>');
  return lines.join('\n');
}

/** The variant offered as the main download: full width, smallest file. */
function bestOutput(result) {
  if (!result?.outputs?.length) return null;
  const maxW = Math.max(...result.outputs.map((o) => o.width));
  return result.outputs.filter((o) => o.width === maxW).sort((a, b) => a.bytes - b.bytes)[0];
}

function readDims(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const pct = (a, b) => (a ? Math.round((1 - b / a) * 100) : 0);

export default function ImageConverter({ initialUrl = null, onConsumedUrl }) {
  // item: { id, file?, name, size, url, dims, state: ready|queued|converting|done|error, result, error, progress }
  const [items, setItems] = useState([]);
  const [formats, setFormats] = useState(['webp', 'avif', 'original']);
  const [quality, setQuality] = useState({ webp: 78, avif: 50, jpeg: 80 });
  const [widths, setWidths] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [openId, setOpenId] = useState(null);
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((i) => { if (i.file) URL.revokeObjectURL(i.url); revokeResult(i.result); }), []);

  const options = () => ({ formats, quality: { ...quality, png: 100 }, widths: parseWidths(widths) });
  const patch = (id, p) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // Convert an image straight from the scan (fetched by the server, no upload needed).
  useEffect(() => {
    if (!initialUrl) return;
    const id = ++uid;
    const name = decodeURIComponent(initialUrl.split('?')[0].split('/').pop() || 'image');
    setItems((l) => [...l, { id, name, size: null, url: initialUrl, dims: null, state: 'converting' }]);
    const o = options();
    api('/images/convert-url', { method: 'POST', body: { url: initialUrl, options: { ...o, widths: o.widths.join(',') } } })
      .then(({ results }) => {
        const r = results[0];
        patch(id, { state: r?.error ? 'error' : 'done', result: r?.error ? null : withUrls(r), error: r?.error, size: r?.input?.bytes, dims: r?.input?.width ? { width: r.input.width, height: r.input.height } : null });
      })
      .catch((e) => patch(id, { state: 'error', error: e.message }));
    onConsumedUrl?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  const addFiles = (list) => {
    setError(null);
    const all = [...list];
    const accepted = all.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|bmp|tiff?|heic|heif)$/i.test(f.name));
    if (accepted.length < all.length) setError('Some files were skipped – only image files (JPG, PNG, WebP, AVIF, GIF, BMP, TIFF) are supported.');
    const fresh = accepted.map((file) => ({ id: ++uid, file, name: file.name, size: file.size, url: URL.createObjectURL(file), dims: null, state: 'ready', error: null }));
    setItems((l) => [...l, ...fresh]);
    fresh.forEach((it) => readDims(it.url).then((d) => d && patch(it.id, { dims: d })));
  };

  const remove = (it) => {
    if (it.file) URL.revokeObjectURL(it.url);
    revokeResult(it.result);
    setItems((l) => l.filter((x) => x.id !== it.id));
  };

  // Server (Sharp) fallback – only for formats this browser cannot decode (e.g. TIFF/HEIC in Chrome).
  const convertOnServer = async (it, opts) => {
    const form = new FormData();
    form.append('files', it.file, it.name);
    form.append('options', JSON.stringify({ ...opts, widths: opts.widths.join(','), keepMetadata: false }));
    const { results } = await api('/images/convert', { method: 'POST', form });
    const r = results[0];
    if (r?.error) throw new Error(r.error);
    return withUrls(r);
  };

  const convertOne = async (it, opts, worker) => {
    patch(it.id, { state: 'converting', error: null, progress: 'Reading file…' });
    try {
      let result;
      try {
        const raw = await runInWorker(worker, await it.file.arrayBuffer(), it.name, opts, (p) => patch(it.id, { progress: p }));
        result = withUrls(raw);
      } catch (e) {
        if (!/cannot be decoded in this browser/i.test(e.message)) throw e;
        patch(it.id, { progress: 'Converting on the server…' });
        result = await convertOnServer(it, opts).catch((err) => {
          throw new Error(/sign in|unauthori/i.test(err.message) ? `${e.message} – sign in to convert it on the server, or save it as PNG/JPG first` : err.message);
        });
      }
      patch(it.id, { state: 'done', result, progress: null });
    } catch (e) {
      patch(it.id, { state: 'error', error: e.message, progress: null });
    }
  };

  const runQueue = async (todo) => {
    if (!formats.length) {
      setError('Choose at least one output format');
      return;
    }
    if (!todo.length) return;
    setBusy(true);
    setError(null);
    const opts = options();
    const ids = new Set(todo.map((t) => t.id));
    todo.forEach((t) => revokeResult(t.result));
    setItems((l) => l.map((x) => (ids.has(x.id) ? { ...x, state: 'queued', result: null, error: null } : x)));
    const queue = [...todo];
    const workers = getPool();
    await Promise.all(workers.slice(0, Math.min(workers.length, queue.length)).map(async (w) => {
      while (queue.length) await convertOne(queue.shift(), opts, w);
    }));
    setBusy(false);
  };
  const convertPending = () => runQueue(itemsRef.current.filter((x) => x.file && x.state !== 'done'));
  const convertAgain = () => runQueue(itemsRef.current.filter((x) => x.file));

  const downloadOne = (o) => downloadBlob(o.blob, o.filename);
  const done = items.filter((i) => i.state === 'done' && i.result);
  const downloadAll = async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const it of done) for (const o of it.result.outputs) zip.file(o.filename, o.blob);
    const md = done
      .map(({ result: r }) => `## ${r.input.name}\nOriginal: ${r.input.format?.toUpperCase()} ${r.input.width}×${r.input.height}, ${formatBytes(r.input.bytes)}\n\n${r.outputs.map((o) => `- ${o.filename}: ${o.width}×${o.height}, ${formatBytes(o.bytes)} (${o.savedPercent > 0 ? '-' : '+'}${Math.abs(o.savedPercent)}%)`).join('\n')}\n\n\`\`\`html\n${pictureCode(r)}\n\`\`\``)
      .join('\n\n');
    zip.file('README.md', `# SpeedLab Pro – optimized images\n\n${md}\n`);
    downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), 'speedlab-optimized-images.zip');
  };

  const clearAll = () => {
    itemsRef.current.forEach((i) => { if (i.file) URL.revokeObjectURL(i.url); revokeResult(i.result); });
    setItems([]);
  };

  const toggleFormat = (k) => setFormats((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const totalIn = items.reduce((s, i) => s + (i.size || 0), 0);
  const doneIn = done.reduce((s, i) => s + (i.result.input?.bytes || i.size || 0), 0);
  // Never count a "bigger than the original" variant – the user would keep the original.
  const doneOut = done.reduce((s, i) => s + Math.min(bestOutput(i.result)?.bytes ?? Infinity, i.result.input?.bytes || i.size || Infinity), 0);
  const pending = items.filter((i) => i.file && ['ready', 'queued', 'converting', 'error'].includes(i.state)).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Wand2} title="Convert & optimize images" subtitle="JPG, PNG, WebP, AVIF, GIF or TIFF → WebP, AVIF or optimized JPEG/PNG. Converted in your browser – no upload, no file-size or file-count limit." />
        <div className="space-y-5 p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cx('flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10' : 'border-slate-300 hover:border-brand-400 dark:border-white/15')}
          >
            <Upload size={26} className="mb-2 text-brand-500" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Drop images here or click to choose</p>
            <p className="mt-1 text-xs text-slate-500">Any number of images, any size – processed on your device (very large images need more RAM)</p>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          <div>
            <span className="label">Output formats</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FORMATS.map((f) => (
                <label key={f.key} className={cx('cursor-pointer rounded-xl border p-3 text-sm transition', formats.includes(f.key) ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-400/10' : 'border-slate-200 dark:border-white/10')}>
                  <span className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={formats.includes(f.key)} onChange={() => toggleFormat(f.key)} />{f.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[['webp', 'WebP quality'], ['avif', 'AVIF quality'], ['jpeg', 'JPEG quality']].map(([k, l]) => (
              <div key={k}>
                <span className="label">{l}: {quality[k]}</span>
                <input type="range" min="1" max="100" value={quality[k]} onChange={(e) => setQuality((q) => ({ ...q, [k]: Number(e.target.value) }))} className="w-full accent-brand-500" />
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="label">Resize (responsive widths)</span>
              <select className="input" value={PRESETS.some((p) => p.value === widths) ? widths : 'custom'} onChange={(e) => e.target.value !== 'custom' && setWidths(e.target.value)}>
                {PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
                <option value="custom">Custom…</option>
              </select>
            </div>
            <div>
              <span className="label">Custom widths (px, comma separated)</span>
              <input className="input" placeholder="e.g. 400, 800, 1200 (blank = original size)" value={widths} onChange={(e) => setWidths(e.target.value.replace(/[^0-9,\s]/g, ''))} />
              <p className="mt-1 text-xs text-slate-500">Images are never upscaled; widths larger than the original are capped.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">PNG output is lossless. EXIF/GPS metadata is always stripped (smaller files, no location data); photos are auto-rotated first.</p>
          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      </Card>

      {items.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {items.map((it) => {
              const best = bestOutput(it.result);
              const inBytes = it.result?.input?.bytes ?? it.size;
              const saved = best && inBytes ? pct(inBytes, best.bytes) : null;
              const dims = best ? `${best.width}×${best.height}` : it.dims ? `${it.dims.width}×${it.dims.height}` : null;
              const preview = best ? best.url : it.url;
              return (
                <li key={it.id}>
                  <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                      <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900 dark:text-white" title={it.name}>{best ? best.filename : it.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {it.state === 'done' && best ? (
                          <>
                            <span>{formatBytes(inBytes)}</span>
                            <span className="mx-1">→</span>
                            <b className="text-slate-900 dark:text-white">{formatBytes(best.bytes)}</b>{' '}
                            {saved > 0 ? (
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">({saved}% smaller · {formatBytes(inBytes - best.bytes)} saved)</span>
                            ) : (
                              <span className="font-medium text-amber-600 dark:text-amber-400">(already optimized – keep the original)</span>
                            )}
                            {dims && <span> · {dims}</span>}
                            <span> · {best.format.toUpperCase()}</span>
                          </>
                        ) : it.state === 'error' ? (
                          <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle size={13} /> {it.error}</span>
                        ) : (
                          <>
                            {inBytes ? formatBytes(inBytes) : ''}
                            {dims ? ` · ${dims}` : ''}
                            <span className="ml-2 inline-flex items-center gap-1 text-xs">
                              {it.state === 'converting' ? <><Loader2 size={12} className="animate-spin text-brand-500" /> {it.progress || 'Converting…'}</> : it.state === 'queued' ? 'Waiting…' : 'Ready'}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {it.result?.outputs?.length > 1 && (
                        <button type="button" onClick={() => setOpenId(openId === it.id ? null : it.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5" aria-expanded={openId === it.id}>
                          {it.result.outputs.length} variants <ChevronDown size={13} className={cx('transition', openId === it.id && 'rotate-180')} />
                        </button>
                      )}
                      <Button size="sm" variant="secondary" icon={Download} disabled={!best} onClick={() => best && downloadOne(best)}>Download</Button>
                      <Button size="sm" variant="secondary" disabled={it.state === 'converting'} onClick={() => remove(it)}>Remove</Button>
                    </div>
                  </div>
                  {openId === it.id && it.result && (
                    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead><tr><th>File</th><th>Format</th><th>Dimensions</th><th>Size</th><th>Saved</th><th /></tr></thead>
                          <tbody>
                            {it.result.outputs.map((o) => (
                              <tr key={o.filename}>
                                <td className="font-medium">{o.filename} {o === best && <Badge tone="green">smallest</Badge>}</td>
                                <td className="uppercase">{o.format} <span className="text-xs text-slate-400">{o.quality === 'lossless' ? 'lossless' : `q${o.quality}`}</span></td>
                                <td className="tabular-nums">{o.width}×{o.height}</td>
                                <td className="tabular-nums">{formatBytes(o.bytes)}</td>
                                <td className={cx('tabular-nums font-medium', o.savedPercent > 0 ? 'text-emerald-600' : 'text-red-500')}>{o.savedPercent > 0 ? '−' : '+'}{Math.abs(o.savedPercent)}%</td>
                                <td><Button size="sm" variant="ghost" icon={Download} onClick={() => downloadOne(o)}>Download</Button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <CodeBlock code={pictureCode(it.result)} language="html" tone="after" title="<picture> markup for these files" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/[0.06]">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {done.length ? (
                <>
                  <b>{done.length} image{done.length === 1 ? '' : 's'}:</b> {formatBytes(doneIn)} to <b>{formatBytes(doneOut)}</b>{' '}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">({pct(doneIn, doneOut)}% smaller · {formatBytes(doneIn - doneOut)} saved)</span>
                  {pending > 0 && <span className="text-slate-400"> · {pending} not converted yet</span>}
                </>
              ) : (
                <>
                  <b>{items.length} image{items.length === 1 ? '' : 's'}</b> · {formatBytes(totalIn)} total
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={clearAll}>Clear all</Button>
              {pending > 0 || busy ? (
                <Button icon={Wand2} loading={busy} onClick={convertPending} disabled={busy}>
                  {busy ? 'Converting…' : `Convert & optimize (${pending})`}
                </Button>
              ) : (
                <Button variant="secondary" icon={Wand2} onClick={convertAgain} disabled={!items.some((i) => i.file)}>Convert again</Button>
              )}
              {done.length > 0 && <Button icon={done.length && !busy ? FileArchive : CheckCircle2} disabled={busy} onClick={downloadAll}>Download all (ZIP)</Button>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
