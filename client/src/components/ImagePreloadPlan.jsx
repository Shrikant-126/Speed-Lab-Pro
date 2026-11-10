import { useMemo, useState } from 'react';
import { Rocket, CheckCircle2 } from 'lucide-react';
import { imagePriorityPlan, PRIORITY_ACTIONS } from '@speedlab/shared/codegen';
import { formatBytes, fileName, shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Badge, Tabs, Notice } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';

export default function ImagePreloadPlan({ report }) {
  const plan = useMemo(() => imagePriorityPlan(report), [report]);
  const [tab, setTab] = useState('list');
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? plan.rows : plan.rows.slice(0, 8);
  const c = plan.counts;
  return (
    <Card>
      <CardHeader
        icon={Rocket}
        title="Which images to preload?"
        subtitle={`${c.preload} to preload · ${c.high} priority hint · ${c.eager} eager · ${c.lazy} lazy${c.unknown ? ` · ${c.unknown} unknown position` : ''}`}
        actions={<Tabs tabs={[{ key: 'list', label: 'Recommendation' }, { key: 'html', label: 'HTML' }, { key: 'shopify', label: 'Shopify' }, { key: 'wordpress', label: 'WordPress' }]} value={tab} onChange={setTab} />}
      />
      <div className="space-y-4 p-5">
        {tab === 'list' && (
          <>
            {!plan.rows.length && <p className="text-sm text-slate-500">No images found for this scan.</p>}
            {!report?.lcp?.imageUrl && (
              <Notice>
                <b>No image needs preloading on this page:</b> the largest element (LCP) is {report?.lcp?.type === 'text' ? 'text' : 'not an image'}
                {report?.lcp?.element?.selector ? <> (<code>{report.lcp.element.selector}</code>)</> : null}. Speed it up by preloading the web font it uses and removing render-blocking CSS instead (see CSS Analyzer).
              </Notice>
            )}
            <div className="space-y-2">
              {rows.map((r) => {
                const a = PRIORITY_ACTIONS[r.action];
                return (
                  <div key={r.img.url} className={`flex gap-3 rounded-2xl border p-3 ${r.action === 'preload' || r.action === 'high' ? 'border-brand-400/60 bg-brand-50/40 dark:border-brand-400/30 dark:bg-brand-400/[0.06]' : 'border-slate-200 dark:border-white/[0.07]'}`}>
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">
                      <img src={r.img.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="max-w-[260px] truncate font-medium text-slate-900 dark:text-white" title={r.img.url}>{fileName(r.img.url)}</p>
                        <Badge tone={a.tone}>{a.label}</Badge>
                        {r.img.isLcp && <Badge tone="red">LCP</Badge>}
                        {r.img.isBackground && <Badge>CSS background</Badge>}
                        {r.done && <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> already correct</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{shortUrl(r.img.url, 60)}{r.img.transferSize ? ` · ${formatBytes(r.img.transferSize)}` : ''}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {plan.rows.length > 8 && (
              <button type="button" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show less' : `Show all ${plan.rows.length} images`}
              </button>
            )}
            <Notice>Rule of thumb: preload at most <b>one</b> image (the LCP image, and only if the browser finds it late). Preloading several images makes them compete and slows the page down.</Notice>
            {!plan.inspected && <Notice tone="warn">Online (Lite) scan: above/below-the-fold position is not measured, so only the LCP image is classified with certainty. Run the full local version for every image.</Notice>}
          </>
        )}
        {tab === 'html' && (
          <>
            <CodeBlock code={plan.headCode} language="html" title="1. <head>" tone="after" />
            {plan.imgCode.map((x) => (
              <div key={x.title} className="space-y-1.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{x.title}</p>
                <div className="grid gap-3 xl:grid-cols-2">
                  <CodeBlock code={x.before} language="html" tone="before" maxHeight={180} />
                  <CodeBlock code={x.after} language="html" tone="after" maxHeight={180} />
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'shopify' && <CodeBlock code={plan.shopify} language="liquid" title="Hero / slideshow section (e.g. sections/image-banner.liquid)" tone="after" />}
        {tab === 'wordpress' && <CodeBlock code={plan.wordpress} language="php" title="functions.php (child theme) or Code Snippets" tone="after" />}
      </div>
    </Card>
  );
}
