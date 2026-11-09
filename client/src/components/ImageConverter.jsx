// Upload JPG/PNG/WebP/GIF/TIFF images (or convert an image from the scan) to
// WebP / AVIF / optimised JPEG / PNG with Sharp, optionally at responsive widths.

import { useEffect, useRef, useState } from 'react';
import { Upload, Wand2, Download, Trash2, FileArchive, ImagePlus, CheckCircle2 } from 'lucide-react';
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

export default function ImageConverter({ initialUrl = null, onConsumedUrl }) {
  const [files, setFiles] = useState([]);
  const [formats, setFormats] = useState(['webp', 'avif', 'original']);
  const [quality, setQuality] = useState({ webp: 78, avif: 50, jpeg: 80, png: 85 });
  const [widths, setWidths] = useState('');
  const [keepMetadata, setKeepMetadata] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api('/images/status').then(setStatus).catch(() => setStatus(null));
  }, []);

  const options = () => ({ formats, quality, widths, keepMetadata });

  const runUrl = async (url) => {
    setBusy(true);
    setError(null);
    try {
      const { results: r } = await api('/images/convert-url', { method: 'POST', body: { url, options: options() } });
      setResults(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialUrl) {
      runUrl(initialUrl);
      onConsumedUrl?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  const addFiles = (list) => {
    const max = status?.limits?.maxFiles || 15;
    const accepted = [...list].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(f.name));
    setFiles((prev) => [...prev, ...accepted].slice(0, max));
  };

  const convert = async () => {
    if (!files.length) return setError('Choose at least one image');
    if (!formats.length) return setError('Choose at least one output format');
    const maxBytes = status?.limits?.maxFileBytes;
    const tooBig = maxBytes && files.find((f) => f.size > maxBytes);
    if (tooBig) return setError(`${tooBig.name} is larger than ${formatBytes(maxBytes)}`);
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f, f.name));
      form.append('options', JSON.stringify(options()));
      const { results: r } = await api('/images/convert', { method: 'POST', form });
      setResults(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (o) => downloadBlob(b64ToBlob(o.data, o.mime), o.filename);
  const downloadAll = async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const r of results) for (const o of r.outputs) zip.file(o.filename, o.data, { base64: true });
    const md = results
      .filter((r) => r.outputs.length)
      .map((r) => `## ${r.input.name}\nOriginal: ${r.input.format?.toUpperCase()} ${r.input.width}×${r.input.height}, ${formatBytes(r.input.bytes)}\n\n${r.outputs.map((o) => `- ${o.filename}: ${o.width}×${o.height}, ${formatBytes(o.bytes)} (${o.savedPercent > 0 ? '-' : '+'}${Math.abs(o.savedPercent)}%)`).join('\n')}\n\n\`\`\`html\n${pictureCode(r)}\n\`\`\``)
      .join('\n\n');
    zip.file('README.md', `# SpeedLab Pro – optimized images\n\n${md}\n`);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'speedlab-optimized-images.zip');
  };

  const toggleFormat = (k) => setFormats((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const totalIn = results.reduce((s, r) => s + (r.input?.bytes || 0), 0);
  const bestTotal = results.reduce((s, r) => s + (r.outputs.length ? Math.min(...r.outputs.filter((o) => o.width === Math.max(...r.outputs.map((x) => x.width))).map((o) => o.bytes)) : 0), 0);

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
            className={cx('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 hover:border-brand-400 dark:border-slate-700')}
          >
            <Upload size={26} className="mb-2 text-brand-600" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Drop images here or click to choose</p>
            <p className="mt-1 text-xs text-slate-500">Up to {status?.limits?.maxFiles || 15} files, {formatBytes(status?.limits?.maxFileBytes || 15728640)} each</p>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2"><ImagePlus size={15} className="shrink-0 text-slate-400" /><span className="truncate">{f.name}</span></span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-slate-500">{formatBytes(f.size)}</span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" aria-label={`Remove ${f.name}`}><Trash2 size={15} /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <span className="label">Output formats</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FORMATS.map((f) => (
                <label key={f.key} className={cx('cursor-pointer rounded-xl border p-3 text-sm transition', formats.includes(f.key) ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800')}>
                  <span className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={formats.includes(f.key)} onChange={() => toggleFormat(f.key)} />{f.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[['webp', 'WebP quality'], ['avif', 'AVIF quality'], ['jpeg', 'JPEG quality'], ['png', 'PNG quality']].map(([k, l]) => (
              <div key={k}>
                <span className="label">{l}: {quality[k]}</span>
                <input type="range" min="1" max="100" value={quality[k]} onChange={(e) => setQuality((q) => ({ ...q, [k]: Number(e.target.value) }))} className="w-full accent-brand-600" />
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
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={keepMetadata} onChange={(e) => setKeepMetadata(e.target.checked)} />
            Keep EXIF/ICC metadata (off = stripped, smaller files and no location data)
          </label>

          {error && <ErrorState title="Conversion failed" message={error} />}
          <div className="flex flex-wrap gap-2">
            <Button icon={Wand2} loading={busy} onClick={convert} disabled={!files.length || (status && !status.sharp)}>
              Convert & optimize {files.length ? `(${files.length})` : ''}
            </Button>
            {files.length > 0 && <Button variant="secondary" onClick={() => { setFiles([]); setResults([]); }}>Clear</Button>}
          </div>
        </div>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader
            icon={CheckCircle2}
            title="Results"
            subtitle={`Measured sizes · ${formatBytes(totalIn)} original → ${formatBytes(bestTotal)} smallest full-size variant`}
            actions={<Button size="sm" icon={FileArchive} onClick={downloadAll}>Download all (ZIP)</Button>}
          />
          <div className="space-y-6 p-5">
            {results.map((r, idx) => (
              <div key={`${r.input?.name}-${idx}`} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{r.input?.name}</p>
                  {r.input?.format && <Badge>{r.input.format.toUpperCase()}</Badge>}
                  {r.input?.width && <Badge>{r.input.width}×{r.input.height}</Badge>}
                  <Badge>{formatBytes(r.input?.bytes)}</Badge>
                </div>
                {r.error ? (
                  <ErrorState title="Could not convert this image" message={r.error} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead><tr><th>Preview</th><th>File</th><th>Format</th><th>Dimensions</th><th>Size</th><th>Saved</th><th /></tr></thead>
                        <tbody>
                          {r.outputs.map((o) => {
                            const best = o.bytes === Math.min(...r.outputs.filter((x) => x.width === o.width).map((x) => x.bytes));
                            return (
                              <tr key={o.filename}>
                                <td><img src={`data:${o.mime};base64,${o.data}`} alt="" className="h-10 w-14 rounded object-cover" /></td>
                                <td className="font-medium">{o.filename} {best && <Badge tone="green">smallest</Badge>}</td>
                                <td className="uppercase">{o.format} <span className="text-xs text-slate-400">q{o.quality}</span></td>
                                <td className="tabular-nums">{o.width}×{o.height}</td>
                                <td className="tabular-nums">{formatBytes(o.bytes)}</td>
                                <td className={cx('tabular-nums font-medium', o.savedPercent > 0 ? 'text-emerald-600' : 'text-red-500')}>{o.savedPercent > 0 ? '−' : '+'}{Math.abs(o.savedPercent)}%</td>
                                <td><Button size="sm" variant="secondary" icon={Download} onClick={() => downloadOne(o)}>Download</Button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {r.outputs.some((o) => o.savedPercent <= 0) && <Notice tone="warn">Some variants are larger than the original – the source is already well compressed. Keep the original for those.</Notice>}
                    <CodeBlock code={pictureCode(r)} language="html" tone="after" title="<picture> markup for these files" />
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
