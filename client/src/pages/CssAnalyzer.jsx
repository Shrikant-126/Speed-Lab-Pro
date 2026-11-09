import { Palette, Type } from 'lucide-react';
import { formatBytes, formatMs, shortUrl, fileName } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import ResourceHints from '../components/ResourceHints.jsx';
import { Card, CardHeader, PageHeader, Stat, Badge, EmptyState } from '../components/ui.jsx';

function UnusedBar({ percent, bytes }) {
  if (percent == null) return <span className="text-slate-400">Unavailable</span>;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="min-w-[140px]">
      <div className="flex justify-between text-xs">
        <span className="tabular-nums">{formatBytes(bytes)}</span>
        <span className="tabular-nums text-slate-500">{p.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 60 ? '#ff4e42' : p > 30 ? '#ffa400' : '#0cce6b' }} />
      </div>
    </div>
  );
}

function CssPage({ report }) {
  const css = report.css || { files: [], fonts: [], totals: {} };
  const files = css.files || [];
  const fonts = css.fonts || [];
  const t = css.totals || {};
  const issues = (report.issues || []).filter((i) => i.category === 'css' || i.category === 'fonts');

  return (
    <div className="space-y-6">
      <PageHeader icon={Palette} title="CSS Analyzer" description="Render-blocking, unused, large and duplicate CSS, @import chains, selector counts and web-font loading." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Stylesheets" value={t.count ?? files.length} />
        <Stat label="CSS transferred" value={formatBytes(t.bytes)} />
        <Stat label="Unused CSS" hint="Uncompressed bytes" value={formatBytes(t.unusedBytes)} tone="text-amber-600 dark:text-amber-400" />
        <Stat label="Render-blocking" value={t.renderBlocking ?? 0} tone={t.renderBlocking ? 'text-red-600 dark:text-red-400' : undefined} />
        <Stat label="Inline CSS" value={t.inlineStyleBytes == null ? 'Unavailable' : formatBytes(t.inlineStyleBytes)} hint="Critical CSS indicator" />
      </div>

      <ResourceHints report={report} />

      <Card>
        <CardHeader title="Stylesheets" subtitle="Unused bytes come from Lighthouse or Chrome CSS coverage" />
        {files.length ? (
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Stylesheet</th>
                  <th>Size</th>
                  <th>Render-blocking</th>
                  <th>Unused</th>
                  <th>Selectors</th>
                  <th>@import</th>
                  <th>Duplicate rules</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.url}>
                    <td>
                      <p className="max-w-[300px] truncate font-medium" title={f.url}>{fileName(f.url)}</p>
                      <p className="max-w-[300px] truncate text-xs text-slate-400">{shortUrl(f.url, 50)}</p>
                      {f.thirdParty && <Badge tone="violet" className="mt-0.5">3rd party</Badge>}
                    </td>
                    <td className="tabular-nums">{f.transferSize != null ? formatBytes(f.transferSize) : '—'}</td>
                    <td>{f.renderBlocking ? <Badge tone="red">Yes{f.blockingMs ? ` · ${formatMs(f.blockingMs)}` : ''}</Badge> : <Badge tone="green">No</Badge>}</td>
                    <td><UnusedBar percent={f.unusedPercent} bytes={f.unusedBytes} /></td>
                    <td className="tabular-nums">{f.selectors != null ? f.selectors.toLocaleString() : '—'}</td>
                    <td>{f.imports?.length ? <Badge tone="amber">{f.imports.length}</Badge> : '—'}</td>
                    <td className="tabular-nums">{f.duplicateRules != null ? f.duplicateRules : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={Palette} title="No external stylesheets detected" /></div>
        )}
      </Card>

      <Card>
        <CardHeader icon={Type} title="Web fonts" subtitle={`${fonts.length} font file${fonts.length === 1 ? '' : 's'}`} />
        {fonts.length ? (
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead><tr><th>Font</th><th>Format</th><th>Size</th><th>Preloaded</th><th>font-display</th><th>Requested at</th></tr></thead>
              <tbody>
                {fonts.map((f) => (
                  <tr key={f.url}>
                    <td>
                      <p className="max-w-[300px] truncate font-medium" title={f.url}>{f.family || fileName(f.url)}</p>
                      <p className="max-w-[300px] truncate text-xs text-slate-400">{shortUrl(f.url, 50)}</p>
                    </td>
                    <td className="uppercase">{f.format || '—'}</td>
                    <td className="tabular-nums">{formatBytes(f.transferSize)}</td>
                    <td>{f.preloaded ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>}</td>
                    <td>{f.fontDisplayIssue ? <Badge tone="red">Blocks text</Badge> : <Badge tone="green">OK</Badge>}</td>
                    <td className="tabular-nums">{formatMs(f.startMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={Type} title="No web fonts loaded" /></div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">CSS & font recommendations ({issues.length})</h2>
        {issues.length ? issues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No CSS or font issues found" />}
      </div>
    </div>
  );
}

export default function CssAnalyzer() {
  return <RequireReport title="CSS Analyzer">{(report) => <CssPage report={report} />}</RequireReport>;
}
