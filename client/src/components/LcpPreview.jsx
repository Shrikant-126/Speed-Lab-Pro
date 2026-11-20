// Visual preview of the LCP element: the actual image (or text) plus the Lighthouse screenshot of
// the page with the LCP element outlined.
import { useState } from 'react';
import { ImageOff, Type, ExternalLink } from 'lucide-react';
import { formatBytes, shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Badge } from './ui.jsx';

function ScreenshotHighlight({ shot, rect }) {
  const [size, setSize] = useState(null); // natural screenshot size
  if (!shot?.data || !rect) return null;
  // Lighthouse's screenshot spans the emulated viewport width; rect is in CSS px of that viewport.
  const scale = size ? size.w / shot.viewportWidth : 1;
  const box = size && {
    left: `${((rect.left * scale) / size.w) * 100}%`,
    top: `${((rect.top * scale) / size.h) * 100}%`,
    width: `${((rect.width * scale) / size.w) * 100}%`,
    height: `${((rect.height * scale) / size.h) * 100}%`,
  };
  return (
    <figure className="min-w-0">
      <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-lg dark:border-white/10 dark:bg-white/5">
        <img src={shot.data} alt="Page screenshot with the LCP element highlighted" className="block w-full" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {box && (
          <div className="pointer-events-none absolute rounded-md border-2 border-brand-400 bg-brand-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45),0_0_22px_rgba(194,238,42,0.8)]" style={box}>
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-brand-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#04090a]">LCP</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-center text-xs text-slate-500">Where the LCP element appears (Lighthouse screenshot)</figcaption>
    </figure>
  );
}

function ImagePreview({ url, image }) {
  const [failed, setFailed] = useState(false);
  const facts = [
    image?.format && image.format.toUpperCase(),
    image?.natural && `${image.natural.w ?? image.natural.width}×${image.natural.h ?? image.natural.height} natural`,
    image?.rendered && `${Math.round(image.rendered.w ?? image.rendered.width)}×${Math.round(image.rendered.h ?? image.rendered.height)} shown`,
    image?.transferSize ? formatBytes(image.transferSize) : null,
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-[repeating-conic-gradient(#94a3b822_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2 dark:border-white/10">
        {failed ? (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500"><ImageOff size={28} /> The image could not be loaded here (hotlink protection or it changed).</div>
        ) : (
          <img src={url} alt="LCP image" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[360px] w-auto max-w-full rounded-lg object-contain" />
        )}
      </div>
      {facts.length > 0 && <div className="flex flex-wrap gap-1.5">{facts.map((f) => <Badge key={f} tone="slate">{f}</Badge>)}</div>}
      <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 break-all text-xs text-brand-600 hover:underline dark:text-brand-300">
        {shortUrl(url, 90)} <ExternalLink size={12} className="shrink-0" />
      </a>
    </div>
  );
}

function TextPreview({ text, tag }) {
  return (
    <div className="flex min-h-[180px] flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Type size={14} /> Text element {tag ? `<${tag}>` : ''}</span>
      {text ? (
        <p className="text-xl font-semibold leading-snug text-slate-900 dark:text-white">“{text}”</p>
      ) : (
        <p className="text-sm text-slate-500">The text content was not captured for this scan – see the element HTML below.</p>
      )}
    </div>
  );
}

export default function LcpPreview({ lcp }) {
  const isImage = !!lcp?.imageUrl;
  const rect = lcp?.element?.boundingRect;
  const shot = lcp?.screenshot;
  if (!lcp?.element && !isImage) return null;
  const text = lcp?.element?.text || (lcp?.type === 'text' ? lcp?.element?.nodeLabel : null);
  return (
    <Card>
      <CardHeader
        title="LCP element preview"
        subtitle={isImage ? (lcp.type === 'background-image' ? 'CSS background image painted as the largest element' : lcp.type === 'video-poster' ? 'Video poster image painted as the largest element' : 'This image is the largest element in the first viewport') : 'This text block is the largest element in the first viewport'}
        actions={<Badge tone="brand">{isImage ? 'Image' : 'Text'}</Badge>}
      />
      <div className={shot?.data && rect ? 'grid items-start gap-6 p-5 lg:grid-cols-[1fr_340px]' : 'p-5'}>
        {isImage ? <ImagePreview url={lcp.imageUrl} image={lcp.image} /> : <TextPreview text={text} tag={lcp.element?.tag} />}
        <ScreenshotHighlight shot={shot} rect={rect} />
      </div>
    </Card>
  );
}
