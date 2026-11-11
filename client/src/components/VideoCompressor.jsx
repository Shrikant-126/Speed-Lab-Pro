// In-browser video compressor (ffmpeg.wasm). Files never leave the user's computer, so there
// is no upload size limit from the server – only the browser's memory (~1–2 GB).
import { useEffect, useRef, useState } from 'react';
import { Film, Upload, Wand2, Download, XCircle, Image as ImageIcon, Trash2, Info } from 'lucide-react';
import { formatBytes } from '@speedlab/shared/format';
import { Card, CardHeader, Button, Notice, ErrorState, Badge, ProgressBar, cx } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';
import { downloadBlob } from '../lib/api.js';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const MAX_BYTES = 1024 * 1024 * 1024;
const RES = [
  { v: '', label: 'Keep original size' },
  { v: '1920', label: '1080p (1920 px)' },
  { v: '1280', label: '720p (1280 px) – recommended for web' },
  { v: '854', label: '480p (854 px) – mobile / background' },
];

let ffmpegPromise = null;
async function getFFmpeg(onLog) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      const ff = new FFmpeg();
      onLog?.('Downloading the compressor (~31 MB, first time only)…');
      await ff.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

async function posterFromVideo(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res;
      v.onerror = () => rej(new Error('Cannot read video for poster'));
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 3);
    await new Promise((res) => (v.onseeked = res));
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const poster = await new Promise((res) => c.toBlob(res, 'image/webp', 0.78));
    return { blob: poster, width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function VideoCompressor() {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('mp4');
  const [width, setWidth] = useState('1280');
  const [crf, setCrf] = useState(28);
  const [fps, setFps] = useState('');
  const [noAudio, setNoAudio] = useState(false);
  const [preset, setPreset] = useState('veryfast');
  const [state, setState] = useState('idle'); // idle | loading | encoding | done | error
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  const ffRef = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (state !== 'encoding' && state !== 'loading') return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => result?.url && URL.revokeObjectURL(result.url), [result]);

  const pick = (f) => {
    if (!f) return;
    setError(null);
    setResult(null);
    if (/^image\//.test(f.type)) {
      setError('That is an image – use Image Optimizer → "Convert & optimize" for images. This tool compresses videos.');
      return;
    }
    if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name)) {
      setError('Choose a video file (MP4, MOV, WebM, MKV, AVI).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('This file is larger than 1 GB – too big to process in the browser. Trim it or use desktop ffmpeg (command below).');
      return;
    }
    setFile(f);
    setCrf(format === 'webm' ? 36 : 28);
  };

  const run = async () => {
    if (!file) return;
    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress(0);
    const t0 = Date.now();
    setStarted(t0);
    try {
      setState('loading');
      const ff = await getFFmpeg(setMsg);
      ffRef.current = ff;
      const { fetchFile } = await import('@ffmpeg/util');
      ff.on('progress', ({ progress: p }) => setProgress(Math.max(0, Math.min(1, p))));
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const input = `input.${ext}`;
      const output = format === 'webm' ? 'output.webm' : 'output.mp4';
      setMsg('Reading video…');
      await ff.writeFile(input, await fetchFile(file));
      setState('encoding');
      setMsg(format === 'webm' ? 'Encoding VP9 WebM (slow in the browser)…' : 'Encoding H.264 MP4…');
      const vf = width ? ['-vf', `scale='min(${width},iw)':-2`] : [];
      const rate = fps ? ['-r', fps] : [];
      const audio = noAudio ? ['-an'] : format === 'webm' ? ['-c:a', 'libopus', '-b:a', '64k'] : ['-c:a', 'aac', '-b:a', '96k'];
      const video = format === 'webm'
        ? ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1']
        : ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
      const code = await ff.exec(['-i', input, ...vf, ...rate, ...video, ...audio, output]);
      if (code !== 0) throw new Error('The video could not be encoded (unsupported codec or corrupted file).');
      const data = await ff.readFile(output);
      await ff.deleteFile(input).catch(() => {});
      await ff.deleteFile(output).catch(() => {});
      const blob = new Blob([data.buffer], { type: format === 'webm' ? 'video/webm' : 'video/mp4' });
      setMsg('Creating poster image…');
      const poster = await posterFromVideo(blob).catch(() => null);
      setResult({ blob, url: URL.createObjectURL(blob), poster, name: `${file.name.replace(/\.[^.]+$/, '')}-compressed.${format}`, seconds: (Date.now() - t0) / 1000 });
      setProgress(1);
      setState('done');
      setMsg('');
    } catch (e) {
      if (cancelled.current) return;
      setState('error');
      setError(e.message || 'Compression failed');
    }
  };

  const cancel = () => {
    cancelled.current = true;
    try {
      ffRef.current?.terminate();
    } catch {
      /* ignore */
    }
    ffmpegPromise = null;
    ffRef.current = null;
    setState('idle');
    setMsg('Cancelled');
    setProgress(0);
  };

  const busy = state === 'loading' || state === 'encoding';
  const elapsed = Math.round(((busy ? now : Date.now()) - started) / 1000);
  const saved = result ? Math.round((1 - result.blob.size / file.size) * 100) : 0;
  const base = file ? file.name.replace(/\.[^.]+$/, '') : 'video';
  const markup = result
    ? `<video ${noAudio ? 'autoplay muted loop playsinline ' : 'controls '}preload="${noAudio ? 'metadata' : 'none'}"\n       poster="${base}-poster.webp" width="${result.poster?.width || ''}" height="${result.poster?.height || ''}">\n  <source src="${result.name}" type="${format === 'webm' ? 'video/webm' : 'video/mp4'}">\n</video>`
    : '';
  const cli = `# Same settings with desktop ffmpeg (faster for long videos)\nffmpeg -i "${file?.name || 'input.mp4'}" ${width ? `-vf "scale='min(${width},iw)':-2" ` : ''}${fps ? `-r ${fps} ` : ''}${format === 'webm' ? `-c:v libvpx-vp9 -crf ${crf} -b:v 0` : `-c:v libx264 -preset slow -crf ${crf} -pix_fmt yuv420p -movflags +faststart`} ${noAudio ? '-an' : format === 'webm' ? '-c:a libopus -b:a 64k' : '-c:a aac -b:a 96k'} "${base}-compressed.${format}"`;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={Film} title="Compress video" subtitle="Drag & drop a video – it is compressed in your browser and never uploaded to any server." />
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
              pick(e.dataTransfer.files[0]);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={cx('flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10' : 'border-slate-300 hover:border-brand-400 dark:border-white/15')}
          >
            <Upload size={28} className="mb-2 text-brand-500" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Drop a video here or click to choose</p>
            <p className="mt-1 text-xs text-slate-500">MP4, MOV, WebM, MKV · up to 1 GB · images go to Image Optimizer → Convert & optimize</p>
            <input ref={inputRef} type="file" accept="video/*,.mkv,.mov" className="hidden" onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {file && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-white/10">
              <span className="flex min-w-0 items-center gap-2"><Film size={16} className="shrink-0 text-brand-500" /><span className="truncate font-medium">{file.name}</span></span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-slate-500">{formatBytes(file.size)}</span>
                {!busy && <button type="button" onClick={() => { setFile(null); setResult(null); }} className="text-slate-400 hover:text-red-500" aria-label="Remove video"><Trash2 size={16} /></button>}
              </span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <span className="label">Format</span>
              <select className="input" value={format} onChange={(e) => { setFormat(e.target.value); setCrf(e.target.value === 'webm' ? 36 : 28); }} disabled={busy}>
                <option value="mp4">MP4 – H.264 (works everywhere, fast)</option>
                <option value="webm">WebM – VP9 (smaller, slow to encode)</option>
              </select>
            </div>
            <div>
              <span className="label">Resolution</span>
              <select className="input" value={width} onChange={(e) => setWidth(e.target.value)} disabled={busy}>
                {RES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <span className="label">Quality (CRF {crf}) – lower = better, bigger</span>
              <input type="range" min={format === 'webm' ? 24 : 18} max={format === 'webm' ? 48 : 36} value={crf} onChange={(e) => setCrf(Number(e.target.value))} disabled={busy} className="w-full accent-brand-500" />
              <div className="flex justify-between text-[11px] text-slate-400"><span>High quality</span><span>Small file</span></div>
            </div>
            <div>
              <span className="label">Frame rate</span>
              <select className="input" value={fps} onChange={(e) => setFps(e.target.value)} disabled={busy}>
                <option value="">Keep original</option>
                <option value="30">30 fps</option>
                <option value="24">24 fps (smaller)</option>
              </select>
            </div>
            {format === 'mp4' && (
              <div>
                <span className="label">Speed</span>
                <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)} disabled={busy}>
                  <option value="ultrafast">Fastest (bigger file)</option>
                  <option value="veryfast">Fast (recommended)</option>
                  <option value="medium">Slower (smaller file)</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={noAudio} onChange={(e) => setNoAudio(e.target.checked)} disabled={busy} />
              Remove audio (background / hero videos)
            </label>
          </div>

          {error && <ErrorState title="Cannot compress" message={error} />}
          {busy && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{msg}</span><span className="num">{state === 'encoding' ? `${Math.round(progress * 100)}%` : ''} · {elapsed}s</span></div>
              <ProgressBar value={state === 'encoding' ? progress * 100 : 3} />
              <p className="text-xs text-slate-500">Keep this tab open. Browser encoding is slower than desktop software – a 1-minute 1080p clip can take a few minutes.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {busy ? <Button variant="danger" icon={XCircle} onClick={cancel}>Cancel</Button> : <Button icon={Wand2} onClick={run} disabled={!file}>Compress video</Button>}
          </div>
          <Notice><Info size={14} className="mr-1 inline" />Videos are processed locally with ffmpeg.wasm – nothing is uploaded. The compressor engine (~31 MB) is downloaded once from jsDelivr and cached by the browser.</Notice>
        </div>
      </Card>

      {result && (
        <Card>
          <CardHeader
            icon={Film}
            title="Compressed video"
            subtitle={`${formatBytes(file.size)} → ${formatBytes(result.blob.size)} · ${saved > 0 ? `${saved}% smaller` : 'not smaller – the original is already well compressed'} · ${Math.round(result.seconds)} s`}
            actions={
              <>
                <Button size="sm" icon={Download} onClick={() => downloadBlob(result.blob, result.name)}>Download video</Button>
                {result.poster?.blob && <Button size="sm" variant="secondary" icon={ImageIcon} onClick={() => downloadBlob(result.poster.blob, `${base}-poster.webp`)}>Poster (WebP)</Button>}
              </>
            }
          />
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <video src={result.url} controls muted playsInline className="w-full rounded-2xl bg-black" />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone={saved > 0 ? 'green' : 'amber'}>{saved > 0 ? `−${saved}%` : 'no saving'}</Badge>
                {result.poster && <Badge>{result.poster.width}×{result.poster.height}</Badge>}
                {result.poster?.duration && <Badge>{Math.round(result.poster.duration)} s</Badge>}
                <Badge>{format.toUpperCase()}</Badge>
              </div>
              <CodeBlock code={markup} language="html" title="Optimised <video> markup" tone="after" />
              <p className="text-xs text-slate-500">Upload the video and the poster next to each other on your site/CDN. Below the fold? Use the lazy video loader in Code Generator → Delay / lazy scripts.</p>
            </div>
          </div>
        </Card>
      )}
      <CodeBlock code={cli} language="bash" title="Desktop alternative (ffmpeg) – same settings" />
    </div>
  );
}
