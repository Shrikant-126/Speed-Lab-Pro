import { useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import { buildResourceHints } from '@speedlab/shared/codegen';
import { formatMs, fileName, shortUrl } from '@speedlab/shared/format';
import { Card, CardHeader, Badge, PriorityBadge, Tabs, Select, Notice } from './ui.jsx';
import CodeBlock from './CodeBlock.jsx';

const ACTION = {
  'preload-high': ['Preload + fetchpriority="high"', 'red'],
  preload: ['Preload', 'orange'],
  'keep-critical': ['Keep blocking + inline critical CSS', 'brand'],
  async: ['Load async (preload → stylesheet, low priority)', 'amber'],
  'media-print': ['media="print"', 'blue'],
  fetchpriority: ['fetchpriority="high" on <img>', 'orange'],
  'fetchpriority-low': ['fetchpriority="low"', 'blue'],
  defer: ['defer', 'amber'],
  preconnect: ['preconnect', 'violet'],
  'dns-prefetch': ['dns-prefetch', 'slate'],
  convert: ['Convert to WOFF2', 'amber'],
  ok: ['No change needed', 'green'],
};
const KIND = { css: 'Stylesheet', font: 'Font', image: 'LCP image', js: 'Script', origin: 'Origin' };

export default function ResourceHints({ report }) {
  const plan = useMemo(() => buildResourceHints(report), [report]);
  const [tab, setTab] = useState('table');
  const [kind, setKind] = useState('all');
  const [hideOk, setHideOk] = useState(true);
  const rows = plan.items.filter((i) => (kind === 'all' || i.kind === kind) && (!hideOk || i.action !== 'ok'));
  const actionable = plan.items.filter((i) => i.action !== 'ok').length;

  return (
    <Card>
      <CardHeader
        icon={Rocket}
        title="Preload & priority hints"
        subtitle={`${actionable} recommended change${actionable === 1 ? '' : 's'}: which resources to preload, set fetchpriority on, preconnect to, load asynchronously or defer, based on this scan`}
      />
      <div className="space-y-4 p-5">
        <Tabs
          tabs={[
            { key: 'table', label: 'Recommendations', count: actionable },
            { key: 'head', label: 'Optimized <head>' },
            { key: 'shopify', label: 'Shopify Liquid' },
            { key: 'wordpress', label: 'WordPress' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'table' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={kind} onChange={setKind} options={[{ value: 'all', label: 'All resources' }, ...Object.entries(KIND).map(([value, label]) => ({ value, label }))]} />
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={hideOk} onChange={(e) => setHideOk(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                Hide resources that need no change
              </label>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Recommendation</th>
                      <th>Priority</th>
                      <th className="min-w-[280px]">Why</th>
                      <th className="min-w-[300px]">Tag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i, n) => (
                      <tr key={`${i.kind}-${i.url}-${n}`}>
                        <td>
                          <Badge>{KIND[i.kind]}</Badge>
                          <p className="mt-1 max-w-[220px] truncate font-medium" title={i.url}>{i.kind === 'origin' ? i.url : fileName(i.url)}</p>
                          {i.kind !== 'origin' && <p className="max-w-[220px] truncate text-xs text-slate-400">{shortUrl(i.url, 40)}</p>}
                          <p className="text-xs text-slate-500">{i.label}</p>
                        </td>
                        <td><Badge tone={ACTION[i.action]?.[1]}>{ACTION[i.action]?.[0] || i.action}</Badge>{i.savingsMs ? <p className="mt-1 text-xs text-slate-500">blocks ~{formatMs(i.savingsMs)} (Lighthouse)</p> : null}</td>
                        <td><PriorityBadge priority={i.priority} /></td>
                        <td className="text-slate-600 dark:text-slate-300">{i.reason}</td>
                        <td>{i.tag ? <pre className="code-scroll max-w-[420px] overflow-x-auto whitespace-pre rounded-lg bg-slate-950 p-2 font-mono text-[11px] text-slate-100">{i.tag}</pre> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No changes recommended for these resources.</p>
            )}
            <Notice>
              Rules applied: only late-discovered resources are preloaded (preloading something already in the HTML gives no gain), at most one image and two fonts are preloaded, and at most four origins are preconnected. Font preloads always need <code>crossorigin</code>.
            </Notice>
          </>
        )}
        {tab === 'head' && <CodeBlock code={plan.head} language="html" tone="after" title="Recommended <head> order" filename="optimized-head.html" maxHeight={520} />}
        {tab === 'shopify' && <CodeBlock code={plan.shopify} language="liquid" tone="after" title="layout/theme.liquid – inside <head>" filename="theme-head.liquid" maxHeight={520} />}
        {tab === 'wordpress' && <CodeBlock code={plan.wordpress} language="php" tone="after" title="functions.php" filename="speedlab-resource-hints.php" maxHeight={520} />}
      </div>
    </Card>
  );
}
