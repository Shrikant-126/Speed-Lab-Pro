import { FileCode2, Cpu } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatBytes, formatMs, shortUrl, fileName } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, Stat, Badge, EmptyState, KeyValue } from '../components/ui.jsx';

const LOADING_TONE = { 'sync-head': 'red', 'sync-body': 'amber', defer: 'green', async: 'blue', module: 'violet' };

function JsPage({ report }) {
  const js = report.js || { files: [], totals: {}, mainThread: [], longTasks: [] };
  const files = js.files || [];
  const t = js.totals || {};
  const mainThread = (js.mainThread || []).filter((m) => m.ms > 0).sort((a, b) => b.ms - a.ms);
  const longTasks = (js.longTasks || []).slice().sort((a, b) => b.durationMs - a.durationMs);
  const issues = (report.issues || []).filter((i) => i.category === 'javascript');
  const L = js.listeners;
  const M = js.mutations;
  const C = js.cdpMetrics;

  return (
    <div className="space-y-6">
      <PageHeader icon={FileCode2} title="JavaScript Analyzer" description="Bundle sizes, unused code, execution cost, long tasks, render-blocking scripts, duplicates, event listeners and DOM work." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Scripts" value={t.count ?? files.length} />
        <Stat label="JS transferred" value={formatBytes(t.bytes)} />
        <Stat label="Unused JS" value={formatBytes(t.unusedBytes)} tone="text-amber-600 dark:text-amber-400" />
        <Stat label="Execution time" value={t.bootupMs ? formatMs(t.bootupMs) : 'Unavailable'} />
        <Stat label="DOM elements" value={t.domNodes != null ? Math.round(t.domNodes).toLocaleString() : 'Unavailable'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={Cpu} title="Main-thread work breakdown" subtitle={t.mainThreadMs ? `Total ${formatMs(t.mainThreadMs)} (Lighthouse)` : 'Lighthouse lab data'} />
          <div className="h-72 p-4">
            {mainThread.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mainThread} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b833" />
                  <XAxis type="number" tickFormatter={(v) => formatMs(v)} stroke="#94a3b8" fontSize={12} />
                  <YAxis type="category" dataKey="group" width={150} stroke="#94a3b8" fontSize={11} />
                  <Tooltip formatter={(v) => formatMs(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="ms" name="Time" fill="#c2ee2a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Main-thread breakdown unavailable" className="h-full" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Runtime instrumentation" subtitle="Event listeners, DOM mutations and CDP metrics (Playwright)" />
          <div className="p-5">
            {L || M || C ? (
              <KeyValue
                items={[
                  ['Event listeners added', L ? L.total.toLocaleString() : 'Unavailable'],
                  ['Scroll/touch/wheel listeners', L ? L.scrollLike : 'Unavailable'],
                  ['Non-passive scroll listeners', L ? L.nonPassive : 'Unavailable'],
                  ['Top listener types', L ? Object.entries(L.byType || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ') : 'Unavailable'],
                  ['DOM mutation records', M ? M.count.toLocaleString() : 'Unavailable'],
                  ['Nodes added', M ? M.added.toLocaleString() : 'Unavailable'],
                  ['Layouts / style recalcs', C ? `${C.LayoutCount ?? '—'} / ${C.RecalcStyleCount ?? '—'}` : 'Unavailable'],
                  ['Script duration (CDP)', C?.ScriptDuration != null ? formatMs(C.ScriptDuration) : 'Unavailable'],
                  ['Task duration (CDP)', C?.TaskDuration != null ? formatMs(C.TaskDuration) : 'Unavailable'],
                  ['JS heap used', C?.JSHeapUsedSize ? formatBytes(C.JSHeapUsedSize) : 'Unavailable'],
                ]}
                className="sm:grid-cols-1"
              />
            ) : (
              <EmptyState title="Browser instrumentation unavailable" description="Requires Playwright/Chromium on the worker." />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Scripts" subtitle="Sorted by transfer size" />
        {files.length ? (
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Script</th>
                  <th>Size</th>
                  <th>Unused</th>
                  <th>Execution</th>
                  <th>Loading</th>
                  <th>Render-blocking</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.url}>
                    <td>
                      <p className="max-w-[320px] truncate font-medium" title={f.url}>{fileName(f.url)}</p>
                      <p className="max-w-[320px] truncate text-xs text-slate-400">{shortUrl(f.url, 55)}</p>
                      {f.thirdParty && <Badge tone="violet" className="mt-0.5">{f.entity || '3rd party'}</Badge>}
                    </td>
                    <td className="tabular-nums">{f.transferSize != null ? formatBytes(f.transferSize) : '—'}</td>
                    <td className="tabular-nums">{f.unusedBytes != null ? `${formatBytes(f.unusedBytes)} (${(f.unusedPercent ?? 0).toFixed(0)}%)` : '—'}</td>
                    <td className="tabular-nums">{f.bootupMs != null ? formatMs(f.bootupMs) : '—'}</td>
                    <td>{f.loading ? <Badge tone={LOADING_TONE[f.loading]}>{f.loading}</Badge> : '—'}</td>
                    <td>{f.renderBlocking ? <Badge tone="red">Yes</Badge> : <Badge tone="green">No</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={FileCode2} title="No external scripts detected" /></div>
        )}
      </Card>

      <Card>
        <CardHeader title="Long main-thread tasks" subtitle="Tasks over 50 ms block input and rendering" />
        {longTasks.length ? (
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead><tr><th>Attributed to</th><th>Start</th><th>Duration</th></tr></thead>
              <tbody>
                {longTasks.map((lt, i) => (
                  <tr key={i}>
                    <td className="max-w-[520px] break-all">{lt.url ? shortUrl(lt.url, 90) : 'Unattributed'}</td>
                    <td className="tabular-nums">{formatMs(lt.startMs)}</td>
                    <td className="tabular-nums">
                      <span className={lt.durationMs > 250 ? 'font-semibold text-red-600' : lt.durationMs > 100 ? 'text-amber-600' : ''}>{formatMs(lt.durationMs)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState title="No long tasks recorded" /></div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">JavaScript recommendations ({issues.length})</h2>
        {issues.length ? issues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No JavaScript issues found" />}
      </div>
    </div>
  );
}

export default function JsAnalyzer() {
  return <RequireReport title="JavaScript Analyzer">{(report) => <JsPage report={report} />}</RequireReport>;
}
