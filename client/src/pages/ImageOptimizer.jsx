import { useMemo, useState } from 'react';
import { Image as ImageIcon, X, Search, ExternalLink, Wand2 } from 'lucide-react';
import ImageConverter from '../components/ImageConverter.jsx';
import { formatBytes, shortUrl, fileName } from '@speedlab/shared/format';
import { optimizedImageMarkup, shopifyImageLiquid, wordpressImagePhp, preloadTag } from '@speedlab/shared/codegen';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { Card, CardHeader, PageHeader, Stat, Badge, PriorityBadge, Select, Tabs, Notice, EmptyState, KeyValue, Button } from '../components/ui.jsx';

const ISSUE_LABELS = {
  oversized: 'Oversized',
  'missing-dimensions': 'No width/height',
  'missing-srcset': 'No srcset',
  'missing-sizes': 'No sizes',
  'legacy-format': 'Legacy format',
  'poor-compression': 'Compressible',
  'lazy-above-fold': 'Lazy above fold',
  'not-lazy': 'Not lazy',
  'lcp-no-fetchpriority': 'LCP w/o fetchpriority',
  'causes-cls': 'Causes CLS',
  'animated-gif': 'Animated GIF',
};

function dims(d) {
  return d?.w ? `${d.w}×${d.h}` : '—';
}

function ImageDetail({ img, report, onClose, onConvert }) {
  const [tab, setTab] = useState('html');
  const vw = report.strategy === 'desktop' ? 1350 : 412;
  const html = optimizedImageMarkup(img, { lcp: img.isLcp, viewportW: vw });
  const tabs = [
    { key: 'html', label: 'HTML' },
    { key: 'shopify', label: 'Shopify Liquid' },
    { key: 'wordpress', label: 'WordPress' },
  ];
  return (
    <Card className="border-brand-300 dark:border-brand-500/40">
      <CardHeader
        title={fileName(img.url)}
        subtitle={img.selector || (img.isBackground ? 'CSS background image' : 'Image')}
        actions={<><Button size="sm" icon={Wand2} onClick={() => onConvert(img.url)} disabled={img.format === 'svg'}>Convert & optimize this image</Button><Button size="sm" variant="ghost" icon={X} onClick={onClose}>Close</Button></>}
      />
      <div className="grid gap-6 p-5 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            <img src={img.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
          </div>
          <a href={img.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 break-all text-xs text-brand-600 hover:underline dark:text-brand-400">
            Open original <ExternalLink size={11} />
          </a>
        </div>
        <div className="space-y-4">
          <KeyValue
            items={[
              ['Format', img.format?.toUpperCase() || 'Unavailable'],
              ['Transfer size', img.transferSize != null ? formatBytes(img.transferSize) : 'Unavailable'],
              ['Intrinsic', img.natural?.w ? `${img.natural.w}×${img.natural.h}px` : 'Unavailable'],
              ['Rendered', img.rendered?.w ? `${img.rendered.w}×${img.rendered.h}px` : 'Unavailable'],
              ['Recommended', img.recommended?.width ? `${img.recommended.width}×${img.recommended.height}px` : '—'],
              ['Recommended format', img.recommended?.format?.toUpperCase() || '—'],
              ['Estimated size', img.estimatedBytes != null ? `${formatBytes(img.estimatedBytes)} (${img.estimatedSource})` : 'Unavailable'],
              ['WebP / AVIF (measured)', img.probe ? `${formatBytes(img.probe.webpBytes)} / ${formatBytes(img.probe.avifBytes)}` : 'Unavailable'],
              ['Above the fold', img.aboveFold === null || img.aboveFold === undefined ? 'Unknown' : img.aboveFold ? 'Yes' : 'No'],
              ['Role', img.role],
            ]}
          />
          <div className="flex flex-wrap gap-1.5">
            {img.issues.map((c) => (
              <Badge key={c} tone="amber">{ISSUE_LABELS[c] || c}</Badge>
            ))}
          </div>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === 'html' && (
            <div className="space-y-3">
              <div className="grid gap-3 xl:grid-cols-2">
                <CodeBlock code={html.before} language="html" tone="before" />
                <CodeBlock code={html.after} language="html" tone="after" />
              </div>
              {img.isLcp && <CodeBlock code={preloadTag(img, vw)} language="html" title="Preload in <head>" />}
              {!html.resizable && <p className="text-xs text-slate-500">The srcset references resized/modern-format variants (e.g. -768w.webp) that you must generate, or serve through an image CDN.</p>}
            </div>
          )}
          {tab === 'shopify' && <CodeBlock code={shopifyImageLiquid(img, { lcp: img.isLcp, settingName: img.isLcp ? 'section.settings.image' : 'image' })} language="liquid" tone="after" />}
          {tab === 'wordpress' && <CodeBlock code={wordpressImagePhp(img, { lcp: img.isLcp })} language="php" tone="after" />}
        </div>
      </div>
    </Card>
  );
}

function ImagesPage({ report, onConvert }) {
  const data = report.images || { images: [], totals: {} };
  const images = data.images || [];
  const totals = data.totals || {};
  const [issue, setIssue] = useState('all');
  const [priority, setPriority] = useState('all');
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const roles = useMemo(() => [...new Set(images.map((i) => i.role).filter(Boolean))], [images]);
  const filtered = images.filter(
    (i) =>
      (issue === 'all' || (issue === 'none' ? !i.issues.length : i.issues.includes(issue))) &&
      (priority === 'all' || i.priority === priority) &&
      (role === 'all' || i.role === role) &&
      (!q || i.url.toLowerCase().includes(q.toLowerCase())),
  );
  const imgIssues = (report.issues || []).filter((i) => i.type.startsWith('img-'));
  const sel = selected ? images.find((i) => i.url === selected) : null;

  return (
    <div className="space-y-6">
      <PageHeader icon={ImageIcon} title="Image Optimizer" description="Every important image on the page: oversizing, formats, compression, lazy loading, dimensions and responsive markup — with copy-ready code." />
      {!report.sources?.pageInspection && (
        <Notice tone="warn">Browser inspection was not available for this scan, so rendered sizes, attributes and above-the-fold detection are limited to what Lighthouse reported.</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Images analysed" value={totals.count ?? images.length} />
        <Stat label="Image bytes" value={formatBytes(totals.bytes)} />
        <Stat label="With issues" value={totals.withIssues ?? 0} />
        <Stat label="Potential savings" value={formatBytes(totals.potentialSavings)} hint={report.sources?.imageProbe ? 'Measured with Sharp where available' : 'Estimate'} tone="text-emerald-600 dark:text-emerald-400" />
      </div>

      {sel && <ImageDetail img={sel} report={report} onClose={() => setSelected(null)} onConvert={onConvert} />}

      <Card>
        <CardHeader title="Images" subtitle={`${filtered.length} of ${images.length} shown · click a row for details and code`} />
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search image URL…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={issue} onChange={setIssue} options={[{ value: 'all', label: 'All issues' }, { value: 'none', label: 'No issues' }, ...Object.entries(ISSUE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <Select value={priority} onChange={setPriority} options={[{ value: 'all', label: 'All priorities' }, ...['critical', 'high', 'medium', 'low'].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))]} />
          <Select value={role} onChange={setRole} options={[{ value: 'all', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))]} />
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Format</th>
                  <th>Size</th>
                  <th>Intrinsic → Rendered</th>
                  <th>Recommended</th>
                  <th>Estimated</th>
                  <th>Issues</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.url} className="cursor-pointer" onClick={() => setSelected(i.url)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                          <img src={i.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-medium text-slate-800 dark:text-slate-200" title={i.url}>{fileName(i.url)}</p>
                          <p className="max-w-[220px] truncate text-xs text-slate-400">{shortUrl(i.url, 40)}</p>
                          <div className="mt-0.5 flex gap-1">
                            {i.isLcp && <Badge tone="red">LCP</Badge>}
                            {i.role && <Badge>{i.role}</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="uppercase">{i.format || '—'}</td>
                    <td className="tabular-nums">{i.transferSize != null ? formatBytes(i.transferSize) : '—'}</td>
                    <td className="whitespace-nowrap tabular-nums">{dims(i.natural)} → {dims(i.rendered)}</td>
                    <td className="whitespace-nowrap tabular-nums">{i.recommended?.width ? `${i.recommended.width}×${i.recommended.height}` : '—'}</td>
                    <td className="whitespace-nowrap">
                      {i.estimatedBytes != null ? (
                        <>
                          <span className="tabular-nums">{formatBytes(i.estimatedBytes)}</span>
                          <p className="text-[11px] text-slate-400">{i.estimatedSource}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {i.issues.length ? i.issues.map((c) => <Badge key={c} tone="amber">{ISSUE_LABELS[c] || c}</Badge>) : <Badge tone="green">OK</Badge>}
                      </div>
                    </td>
                    <td>{i.priority ? <PriorityBadge priority={i.priority} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState icon={ImageIcon} title={images.length ? 'No images match the filters' : 'No images detected'} />
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Image issues ({imgIssues.length})</h2>
        {imgIssues.length ? imgIssues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No image issues found" />}
      </div>
    </div>
  );
}

export default function ImageOptimizer() {
  const [tab, setTab] = useState('scan');
  const [convertUrl, setConvertUrl] = useState(null);
  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { key: 'scan', label: 'Scan results' },
          { key: 'convert', label: 'Convert & optimize' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'convert' ? (
        <>
          <PageHeader icon={Wand2} title="Image Converter" description="Optimize and convert JPG/PNG/WebP/GIF images to WebP, AVIF or compressed JPEG/PNG, with responsive sizes and ready <picture> markup. Your live website is never modified." />
          <ImageConverter initialUrl={convertUrl} onConsumedUrl={() => setConvertUrl(null)} />
        </>
      ) : (
        <RequireReport title="Image Optimizer">
          {(report) => (
            <ImagesPage
              report={report}
              onConvert={(u) => {
                setConvertUrl(u);
                setTab('convert');
              }}
            />
          )}
        </RequireReport>
      )}
    </div>
  );
}
