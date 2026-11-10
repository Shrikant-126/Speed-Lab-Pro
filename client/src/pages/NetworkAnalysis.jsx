import { useMemo, useState } from 'react';
import { Network, Server, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { formatBytes, formatMs, shortUrl } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, KeyValue, Notice, Badge, Select, EmptyState, Stat, SourceTag } from '../components/ui.jsx';

const TYPE_COLORS = {
  document: '#c2ee2a',
  css: '#2dd4bf',
  js: '#f59e0b',
  image: '#10b981',
  font: '#ec4899',
  media: '#ef4444',
  xhr: '#0ea5e9',
  other: '#94a3b8',
};

const PHASES = [
  ['redirectMs', 'Redirects', '#94a3b8'],
  ['dnsMs', 'DNS lookup', '#0ea5e9'],
  ['tcpMs', 'TCP connect', '#c2ee2a'],
  ['tlsMs', 'TLS handshake', '#2dd4bf'],
  ['requestToFirstByteMs', 'Server wait', '#f59e0b'],
  ['downloadMs', 'HTML download', '#10b981'],
];

function TimingBar({ timing }) {
  const parts = PHASES.map(([k, label, color]) => ({ k, label, color, ms: timing?.[k] })).filter((p) => typeof p.ms === 'number' && p.ms > 0);
  const total = parts.reduce((s, p) => s + p.ms, 0);
  if (!total) return <p className="text-sm text-slate-500">Connection phase timing unavailable.</p>;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {parts.map((p) => (
          <div key={p.k} title={`${p.label}: ${formatMs(p.ms)}`} style={{ width: `${(p.ms / total) * 100}%`, background: p.color }} className="flex items-center justify-center text-[11px] font-medium text-white">
            {p.ms / total > 0.1 ? formatMs(p.ms) : ''}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} /> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Waterfall({ requests }) {
  const [type, setType] = useState('all');
  const [party, setParty] = useState('all');
  const list = useMemo(() => {
    let l = [...requests];
    if (type !== 'all') l = l.filter((r) => r.type === type);
    if (party === 'first') l = l.filter((r) => !r.thirdParty);
    if (party === 'third') l = l.filter((r) => r.thirdParty);
    return l.sort((a, b) => a.startMs - b.startMs).slice(0, 60);
  }, [requests, type, party]);
  const max = Math.max(1, ...list.map((r) => r.endMs || r.startMs + r.durationMs));
  const types = [...new Set(requests.map((r) => r.type))];
  return (
    <Card>
      <CardHeader
        title="Request waterfall"
        subtitle={`First ${list.length} requests by start time (of ${requests.length} total)`}
        actions={
          <>
            <Select value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t }))]} />
            <Select value={party} onChange={setParty} options={[{ value: 'all', label: 'All origins' }, { value: 'first', label: 'First-party' }, { value: 'third', label: 'Third-party' }]} />
          </>
        }
      />
      <div className="overflow-x-auto p-4">
        {!list.length ? (
          <EmptyState title="No requests" description="No requests match these filters." className="py-6" />
        ) : (
          <div className="min-w-[640px] space-y-1">
            {list.map((r, i) => (
              <div key={`${r.url}-${i}`} className="grid grid-cols-[minmax(0,260px)_1fr_70px] items-center gap-3 text-xs">
                <span className="truncate text-slate-600 dark:text-slate-300" title={r.url}>
                  {r.thirdParty && <span className="mr-1 text-amber-500">●</span>}
                  {shortUrl(r.url, 48)}
                </span>
                <div className="relative h-3.5 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="absolute h-full rounded"
                    style={{ left: `${(r.startMs / max) * 100}%`, width: `${Math.max(0.4, ((r.durationMs || 1) / max) * 100)}%`, background: TYPE_COLORS[r.type] || TYPE_COLORS.other }}
                    title={`${r.type} · start ${formatMs(r.startMs)} · ${formatMs(r.durationMs)} · ${formatBytes(r.transferSize)}`}
                  />
                </div>
                <span className="text-right tabular-nums text-slate-500">{formatBytes(r.transferSize)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between pl-[272px] pr-[82px] text-[11px] text-slate-400">
              <span>0</span>
              <span>{formatMs(max)}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Content({ report }) {
  const net = report.network || {};
  const doc = net.document;
  const t = net.timing || {};
  const byType = report.resources?.summary?.byType || {};
  const pieData = Object.entries(byType).map(([k, v]) => ({ name: k, value: v.bytes, count: v.count })).filter((d) => d.value > 0);
  const issues = (report.issues || []).filter((i) => i.category === 'network' || i.category === 'server');

  return (
    <div className="space-y-6">
      <Notice>
        Timing is measured from the scanner&apos;s location ({t.source === 'playwright' ? 'Playwright navigation timing' : t.source === 'probe' ? 'raw socket probe' : 'unavailable'}). From a public URL scan SpeedLab Pro can only observe symptoms such as slow TTFB or missing cache headers — backend root causes (database queries, application code, hosting resources) cannot be determined without server access.
      </Notice>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="TTFB (lab)" value={formatMs(report.lab?.ttfb?.value ?? t.ttfbMs)} hint={report.lab?.ttfb?.value != null ? 'Lighthouse' : t.ttfbMs != null ? 'Scanner measurement' : 'Unavailable'} />
        <Stat label="Requests" value={report.resources?.summary?.requests ?? '—'} hint={`${report.resources?.summary?.domains ?? '—'} domains`} />
        <Stat label="Total transfer" value={formatBytes(net.totalBytes ?? report.resources?.summary?.bytes)} />
        <Stat label="Protocol" value={net.protocol || doc?.alpn || '—'} hint={doc?.http3Advertised ? 'HTTP/3 advertised (Alt-Svc)' : 'No HTTP/3 advertised'} />
      </div>

      <Card>
        <CardHeader icon={Server} title="Document connection timing" subtitle="Where time is spent before the HTML arrives" actions={<SourceTag kind={t.source ? 'measured' : 'unavailable'} />} />
        <div className="space-y-5 p-5">
          <TimingBar timing={t} />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Phase</th><th className="text-right">Duration</th></tr>
              </thead>
              <tbody>
                {[...PHASES, ['ttfbMs', 'Time to First Byte (total)'], ['domContentLoadedMs', 'DOMContentLoaded'], ['loadMs', 'Load event']].map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="text-right tabular-nums">{t[k] == null ? 'Unavailable' : formatMs(t[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={Network} title="HTML document" subtitle="Response headers of the final document" />
          <div className="p-5">
            {doc ? (
              <KeyValue
                className="sm:grid-cols-1"
                items={[
                  ['Final URL', doc.finalUrl],
                  ['Status code', doc.statusCode],
                  ['Compression', doc.compression || 'None'],
                  ['HTML size', formatBytes(doc.htmlBytes)],
                  ['Cache-Control', doc.cacheControl || 'Not set'],
                  ['Cache status', doc.cacheStatus || 'Not reported'],
                  ['CDN', doc.cdn?.length ? doc.cdn.join(', ') : 'None detected'],
                  ['Server', doc.server || 'Not disclosed'],
                  ['HTTP version (ALPN)', doc.alpn || net.protocol || 'Unavailable'],
                  ['TLS version', doc.tlsVersion || 'Unavailable'],
                  ['HTTP/3 advertised', doc.http3Advertised ? 'Yes' : 'No'],
                  ['Server IP', doc.ip || 'Unavailable'],
                ]}
              />
            ) : (
              <EmptyState title="Document probe unavailable" description="The header probe did not run or failed for this scan." className="py-6" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Bytes by resource type" subtitle="Transfer size per type" />
          <div className="p-5">
            {pieData.length ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                        {pieData.map((d) => <Cell key={d.name} fill={TYPE_COLORS[d.name] || TYPE_COLORS.other} />)}
                      </Pie>
                      <Tooltip formatter={(v, n, p) => [`${formatBytes(v)} (${p.payload.count} requests)`, n]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <EmptyState title="No request data" className="py-6" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Redirect chain" subtitle={net.redirects?.length ? `${net.redirects.length} redirect(s) before the final document` : 'No redirects'} />
        <div className="p-5">
          {net.redirects?.length ? (
            <ol className="space-y-2 text-sm">
              {net.redirects.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 break-all">
                  <Badge tone="amber">{r.status || '3xx'}</Badge>
                  <span>{r.url}</span>
                  {r.location && (
                    <>
                      <ArrowRight size={14} className="text-slate-400" />
                      <span className="text-slate-600 dark:text-slate-300">{r.location}</span>
                    </>
                  )}
                  {r.ms != null && <span className="text-xs text-slate-500">({formatMs(r.ms)})</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">The requested URL served the document directly.</p>
          )}
        </div>
      </Card>

      {report.resources?.requests?.length ? <Waterfall requests={report.resources.requests} /> : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Network & server issues ({issues.length})</h2>
        {issues.length ? issues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No network or server issues detected" className="py-8" />}
      </div>
    </div>
  );
}

export default function NetworkAnalysis() {
  return (
    <div>
      <PageHeader icon={Network} title="Network Analysis" description="Server response, TTFB breakdown, redirects, compression, caching, CDN and request waterfall." />
      <RequireReport title="network analysis">{(report) => <Content report={report} />}</RequireReport>
    </div>
  );
}
