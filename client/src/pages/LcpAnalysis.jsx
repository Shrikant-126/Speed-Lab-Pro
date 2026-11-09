import { Target, CheckCircle2, XCircle, HelpCircle, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { formatBytes, formatMs, shortUrl } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import MetricCard from '../components/MetricCard.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { Card, CardHeader, PageHeader, KeyValue, Badge, EmptyState, Notice, SourceTag } from '../components/ui.jsx';

const PHASE_COLORS = { ttfb: '#6366f1', loadDelay: '#f59e0b', loadDuration: '#0ea5e9', renderDelay: '#ef4444' };

const CHECKS = [
  ['lazyLoaded', 'Not lazy-loaded', false],
  ['fetchPriorityHigh', 'fetchpriority="high" set', true],
  ['preloaded', 'Preloaded with <link rel="preload">', true],
  ['cssBackground', 'Rendered as <img> (not a CSS background)', false],
  ['discoverableInHtml', 'Discoverable in initial HTML', true],
  ['jsDelaysDiscovery', 'Not delayed by JavaScript / lazy-load library', false],
  ['responsive', 'Responsive (srcset / <picture>)', true],
  ['hasDimensions', 'Has width and height', true],
];

function CheckRow({ label, value, good }) {
  // value: boolean|null. "good" says which boolean value is a pass.
  const state = value === null || value === undefined ? 'unknown' : value === good ? 'pass' : 'fail';
  const Icon = state === 'pass' ? CheckCircle2 : state === 'fail' ? XCircle : HelpCircle;
  const color = state === 'pass' ? 'text-emerald-500' : state === 'fail' ? 'text-red-500' : 'text-slate-400';
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
      <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Icon size={16} className={color} /> {label}
      </span>
      <span className={`text-xs font-medium ${color}`}>{state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Unknown'}</span>
    </li>
  );
}

function Timeline({ phases }) {
  const total = phases.reduce((s, p) => s + p.ms, 0) || 1;
  return (
    <div>
      <div className="flex h-10 overflow-hidden rounded-xl">
        {phases.map((p) =>
          p.ms > 0 ? (
            <div
              key={p.key}
              className="flex items-center justify-center overflow-hidden text-xs font-semibold text-white"
              style={{ width: `${(p.ms / total) * 100}%`, background: PHASE_COLORS[p.key] }}
              title={`${p.label}: ${formatMs(p.ms)}`}
            >
              {(p.ms / total) > 0.1 ? formatMs(p.ms) : ''}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {phases.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded" style={{ background: PHASE_COLORS[p.key] }} />
            <span className="text-slate-600 dark:text-slate-300">{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">{formatMs(p.ms)}</span>
            <span className="text-xs text-slate-400">{p.percent ?? 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LcpPage({ report }) {
  const lcp = report.lcp || {};
  const issues = (report.issues || []).filter((i) => i.category === 'lcp');
  const img = lcp.image;
  const hasData = lcp.element || lcp.phases;

  return (
    <div className="space-y-6">
      <PageHeader icon={Target} title="LCP Analysis" description="Breakdown of Largest Contentful Paint into its four sub-parts, with discovery and priority checks for the LCP resource." />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard metric="lcp" value={report.lab?.lcp?.value} source="lab" />
        <MetricCard metric="lcp" value={report.field?.metrics?.lcp?.p75 ?? null} source="field" note={report.field ? `Real users, ${report.field.scope}-level data (p75)` : 'No Chrome UX Report data for this page/origin.'} />
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">LCP element type</p>
          <p className="mt-3 text-2xl font-bold capitalize text-slate-900 dark:text-white">{lcp.type ? lcp.type.replace('-', ' ') : 'Unavailable'}</p>
          {lcp.element?.tag && <Badge tone="brand" className="mt-2">&lt;{lcp.element.tag}&gt;</Badge>}
        </Card>
      </div>

      {!hasData && <EmptyState icon={Target} title="LCP details unavailable" description="Lighthouse and the browser inspection did not return an LCP element for this scan." />}

      {lcp.element && (
        <Card>
          <CardHeader title="LCP element" subtitle={lcp.element.nodeLabel || 'Largest element painted in the viewport'} />
          <div className="space-y-4 p-5">
            <KeyValue items={[['Selector', lcp.element.selector], ['Tag', lcp.element.tag], ['Type', lcp.type]]} />
            {lcp.element.snippet && <CodeBlock code={lcp.element.snippet} language="html" title="Element HTML" maxHeight={200} />}
            {lcp.type === 'text' && (
              <Notice>The LCP element is text. Resource load phases do not apply; focus on TTFB, render-blocking CSS/JS and web-font loading (font-display).</Notice>
            )}
          </div>
        </Card>
      )}

      {lcp.phases && (
        <Card>
          <CardHeader
            title="LCP phase timeline"
            subtitle="Time to First Byte → Resource Load Delay → Resource Load Duration → Element Render Delay"
            actions={<SourceTag kind={lcp.phaseSource === 'lighthouse' ? 'lab' : 'measured'} />}
          />
          <div className="space-y-6 p-5">
            {lcp.phaseNote && <Notice>{lcp.phaseNote}</Notice>}
            {lcp.phaseSource === 'playwright-unthrottled' && <Notice tone="warn">Phases measured from an unthrottled Playwright page load (Lighthouse breakdown unavailable). Absolute values will be lower than throttled lab data.</Notice>}
            <Timeline phases={lcp.phases} />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lcp.phases} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b833" />
                  <XAxis type="number" tickFormatter={(v) => formatMs(v)} stroke="#94a3b8" fontSize={12} />
                  <YAxis type="category" dataKey="label" width={160} stroke="#94a3b8" fontSize={12} />
                  <Tooltip formatter={(v) => formatMs(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="ms" name="Duration" radius={[0, 6, 6, 0]}>
                    {lcp.phases.map((p) => (
                      <Cell key={p.key} fill={PHASE_COLORS[p.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {lcp.dominantPhase && (
              <div className="rounded-xl border-l-4 bg-slate-50 p-4 dark:bg-slate-800/40" style={{ borderColor: PHASE_COLORS[lcp.dominantPhase.key] }}>
                <p className="font-semibold text-slate-900 dark:text-white">
                  Largest delay: {lcp.dominantPhase.label} ({formatMs(lcp.dominantPhase.ms)}, {lcp.dominantPhase.percent}%)
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{lcp.dominantPhase.explanation}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {lcp.imageUrl && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="LCP resource checks" subtitle="Discovery, priority and sizing of the LCP image" />
            <ul className="px-5 py-3">
              {CHECKS.map(([key, label, good]) => (
                <CheckRow key={key} label={label} value={lcp.checks?.[key] ?? null} good={good} />
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="LCP image details" />
            <div className="space-y-4 p-5">
              <a href={lcp.imageUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 break-all text-sm text-brand-600 hover:underline dark:text-brand-400">
                {shortUrl(lcp.imageUrl, 100)} <ExternalLink size={12} className="shrink-0" />
              </a>
              <KeyValue
                className="sm:grid-cols-1"
                items={[
                  ['Format', img?.format ? img.format.toUpperCase() : 'Unavailable'],
                  ['Transfer size', img?.transferSize != null ? formatBytes(img.transferSize) : 'Unavailable'],
                  ['Intrinsic size', img?.natural?.w ? `${img.natural.w} × ${img.natural.h}px` : 'Unavailable'],
                  ['Rendered size', img?.rendered?.w ? `${img.rendered.w} × ${img.rendered.h}px` : 'Unavailable'],
                  ['Request priority', img?.requestPriority || 'Unavailable'],
                  ['Request start / duration', img?.requestStartMs != null ? `${formatMs(img.requestStartMs)} / ${formatMs(img.requestDurationMs)}` : 'Unavailable'],
                  ['loading / fetchpriority', `${img?.attrs?.loading || '—'} / ${img?.attrs?.fetchpriority || '—'}`],
                  ['WebP size (measured)', img?.webpBytes != null ? formatBytes(img.webpBytes) : 'Unavailable'],
                  ['AVIF size (measured)', img?.avifBytes != null ? formatBytes(img.avifBytes) : 'Unavailable'],
                ]}
              />
              {(img?.webpBytes != null || img?.avifBytes != null) && <p className="text-xs text-slate-500">Modern-format sizes were measured by re-encoding the image with Sharp (WebP q75, AVIF q50).</p>}
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">LCP recommendations ({issues.length})</h2>
        {issues.length ? (
          issues.map((i, idx) => <IssueCard key={i.id} issue={i} report={report} defaultOpen={idx === 0} />)
        ) : (
          <EmptyState icon={CheckCircle2} title="No LCP-specific issues found" description="The LCP resource is discovered and prioritised correctly. Check render-blocking CSS/JS and TTFB if LCP is still slow." />
        )}
      </div>
    </div>
  );
}

export default function LcpAnalysis() {
  return <RequireReport title="LCP Analysis">{(report) => <LcpPage report={report} />}</RequireReport>;
}
