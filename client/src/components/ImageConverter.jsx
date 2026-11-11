// Upload JPG/PNG/WebP/GIF/TIFF images (or convert an image from the scan) to
// WebP / AVIF / optimised JPEG / PNG with Sharp, optionally at responsive widths.
// Each image is converted in its own request (3 in parallel), so large batches stay
// within serverless body limits and every row shows its own progress.

import { useEffect, useRef, useState } from 'react';
import { Upload, Wand2, Download, FileArchive, CheckCircle2, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { formatBytes } from '@speedlab/shared/format';
import { api, downloadBlob } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, ErrorState, Notice, cx } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';

const FORMATS = [
  { key: 'webp', label: 'WebP', hint: 'Best compatibility, ~25–35% smaller than JPEG' },
  { key: 'avif', label: 'AVIF', hint: 'Smallest files, slower to encode' },
  { key: 'original', label: 'Optimized original', hint: 'Same format (JPEG/PNG), recompressed' },
  { key: 'jpeg', label: 'JPEG', hint: 'Convert to progressive mozjpeg' },
  { key: 'png', label: 'PNG', hint: 'Palette-quantised PNG' },
];
const PRESETS = [
  { label: 'Keep original size', value: '' },
  { label: 'Responsive: 480, 768, 1080, 1600', value: '480,768,1080,1600' },
  { label: 'Hero: 640, 960, 1280, 1920, 2400', value: '640,960,1280,1920,2400' },
  { label: 'Product: 360, 540, 720, 1080', value: '360,540,720,1080' },
  { label: 'Thumbnail: 150, 300', value: '150,300' },
];
const MAX_FILES = 50;
const CONCURRENCY = 3;
let uid = 0;

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
  // item: { id, file?, name, size, url, dims, state: ready|queued|converting|done|error, result, error }
  const [items, setItems] = useState([]);
  const [formats, setFormats] = useState(['webp', 'avif', 'original']);
  const [quality, setQuality] = useState({ webp: 78, avif: 50, jpeg: 80, png: 85 });
  const [widths, setWidths] = useState('');
  const [keepMetadata, setKeepMetadata] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [drag, setDrag] = useState(false);
  const [openId, setOpenId] = useState(null);
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    api('/images/status').then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => () => itemsRef.current.forEach((i) => i.file && URL.revokeObjectURL(i.url)), []);

  const options = () => ({ formats, quality, widths, keepMetadata });
  const patch = (id, p) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // Convert an image straight from the scan (no upload needed).
  useEffect(() => {
    if (!initialUrl) return;
    const id = ++uid;
    const name = decodeURIComponent(initialUrl.split('?')[0].split('/').pop() || 'image');
    setItems((l) => [...l, { id, name, size: null, url: initialUrl, dims: null, state: 'converting' }]);
    api('/images/convert-url', { method: 'POST', body: { url: initialUrl, options: options() } })
      .then(({ results }) => {
        const r = results[0];
        patch(id, { state: r?.error ? 'error' : 'done', result: r?.error ? null : r, error: r?.error, size: r?.input?.bytes, dims: r?.input?.width ? { width: r.input.width, height: r.input.height } : null });
      })
      .catch((e) => patch(id, { state: 'error', error: e.message }));
    onConsumedUrl?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  const addFiles = (list) => {
    setError(null);
    const all = [...list];
    const accepted = all.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(f.name));
    const notes = [];
    if (accepted.length < all.length) notes.push('Some files were skipped – only JPG, PNG, WebP, AVIF, GIF and TIFF images are supported.');
    const room = MAX_FILES - itemsRef.current.length;
    if (accepted.length > room) notes.push(`Up to ${MAX_FILES} images at a time – ${accepted.length - Math.max(0, room)} were not added.`);
    if (notes.length) setError(notes.join(' '));
    const maxBytes = status?.limits?.maxFileBytes;
    const fresh = accepted.slice(0, Math.max(0, room)).map((file) => {
      const url = URL.createObjectURL(file);
      const tooBig = maxBytes && file.size > maxBytes;
      return { id: ++uid, file, name: file.name, size: file.size, url, dims: null, state: tooBig ? 'error' : 'ready', error: tooBig ? `Larger than ${formatBytes(maxBytes)} – resize it first` : null, tooBig };
    });
    setItems((l) => [...l, ...fresh]);
    fresh.forEach((it) => readDims(it.url).then((d) => d && patch(it.id, { dims: d })));
  };

  const remove = (it) => {
    if (it.file) URL.revokeObjectURL(it.url);
    setItems((l) => l.filter((x) => x.id !== it.id));
  };

  const convertOne = async (it, opts) => {
    patch(it.id, { state: 'converting', error: null });
    try {
      const form = new FormData();
      form.append('files', it.file, it.name);
      form.append('options', JSON.stringify(opts));
      const { results } = await api('/images/convert', { method: 'POST', form });
      const r = results[0];
      patch(it.id, r?.error ? { state: 'error', error: r.error, result: null } : { state: 'done', result: r });
    } catch (e) {
      patch(it.id, { state: 'error', error: e.message });
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
    setItems((l) => l.map((x) => (ids.has(x.id) ? { ...x, state: 'queued', result: null, error: null } : x)));
    const queue = [...todo];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await convertOne(queue.shift(), opts);
    }));
    setBusy(false);
  };
  const convertPending = () => runQueue(itemsRef.current.filter((x) => x.file && !x.tooBig && x.state !== 'done'));
  const convertAgain = () => runQueue(itemsRef.current.filter((x) => x.file && !x.tooBig));

  const downloadOne = (o) => downloadBlob(b64ToBlob(o.data, o.mime), o.filename);
  const done = items.filter((i) => i.state === 'done' && i.result);
  const downloadAll = async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const it of done) for (const o of it.result.outputs) zip.file(o.filename, o.data, { base64: true });
    const md = done
      .map(({ result: r }) => `## ${r.input.name}\nOriginal: ${r.input.format?.toUpperCase()} ${r.input.width}×${r.input.height}, ${formatBytes(r.input.bytes)}\n\n${r.outputs.map((o) => `- ${o.filename}: ${o.width}×${o.height}, ${formatBytes(o.bytes)} (${o.savedPercent > 0 ? '-' : '+'}${Math.abs(o.savedPercent)}%)`).join('\n')}\n\n\`\`\`html\n${pictureCode(r)}\n\`\`\``)
      .join('\n\n');
    zip.file('README.md', `# SpeedLab Pro – optimized images\n\n${md}\n`);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'speedlab-optimized-images.zip');
  };

  const toggleFormat = (k) => setFormats((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const totalIn = items.reduce((s, i) => s + (i.size || 0), 0);
  const doneIn = done.reduce((s, i) => s + (i.result.input?.bytes || i.size || 0), 0);
  // Never count a "bigger than the original" variant – the user would keep the original.
  const doneOut = done.reduce((s, i) => s + Math.min(bestOutput(i.result)?.bytes ?? Infinity, i.result.input?.bytes || i.size || Infinity), 0);
  const pending = items.filter((i) => i.file && !i.tooBig && ['ready', 'queued', 'converting', 'error'].includes(i.state)).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Wand2} title="Convert & optimize images" subtitle="JPG, PNG, WebP, AVIF, GIF or TIFF → WebP, AVIF or optimized JPEG/PNG. Processed on the server with Sharp; nothing is stored." />
        <div className="space-y-5 p-5">
          {status && !status.sharp && <ErrorState title="Sharp is not available on the server" message="Install it with: npm install sharp" />}
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
            <p className="mt-1 text-xs text-slate-500">Up to {MAX_FILES} images, {formatBytes(status?.limits?.maxFileBytes || 15728640)} each</p>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[['webp', 'WebP quality'], ['avif', 'AVIF quality'], ['jpeg', 'JPEG quality'], ['png', 'PNG quality']].map(([k, l]) => (
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
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={keepMetadata} onChange={(e) => setKeepMetadata(e.target.checked)} />
            Keep EXIF/ICC metadata (off = stripped, smaller files and no location data)
          </label>
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
              const preview = best ? `data:${best.mime};base64,${best.data}` : it.url;
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
                              {it.state === 'converting' ? <><Loader2 size={12} className="animate-spin text-brand-500" /> Converting…</> : it.state === 'queued' ? 'Waiting…' : 'Ready'}
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
                                <td className="uppercase">{o.format} <span className="text-xs text-slate-400">q{o.quality}</span></td>
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
              <Button variant="secondary" disabled={busy} onClick={() => { items.forEach((i) => i.file && URL.revokeObjectURL(i.url)); setItems([]); }}>Clear all</Button>
              {pending > 0 || busy ? (
                <Button icon={Wand2} loading={busy} onClick={convertPending} disabled={busy || (status && !status.sharp)}>
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
