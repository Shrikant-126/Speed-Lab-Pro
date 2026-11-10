import { Link } from 'react-router-dom';
import { ArrowRight, Smartphone, Monitor, Lightbulb, RefreshCw, ScanSearch, Image as ImageIcon, FileCode2, Palette, Puzzle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import RequireReport from '../components/RequireReport.jsx';
import ScoreGauge from '../components/ScoreGauge.jsx';
import MetricCard from '../components/MetricCard.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, Badge, Stat, Button, Notice } from '../components/ui.jsx';
import { formatBytes, formatMetric } from '@speedlab/shared/format';

const TYPE_COLORS = { image: '#6366f1', js: '#f59e0b', css: '#ec4899', font: '#14b8a6', media: '#8b5cf6', document: '#0ea5e9', xhr: '#64748b', other: '#94a3b8' };
const TYPE_LABEL = { image: 'Images', js: 'JavaScript', css: 'CSS', font: 'Fonts', media: 'Video/Audio', document: 'HTML', xhr: 'XHR/Fetch', other: 'Other' };

function DeviceCompare({ reports }) {
  if (!reports.mobile || !reports.desktop) return null;
  return (
    <Card>
      <CardHeader title="Mobile vs Desktop" subtitle="Separate Lighthouse runs" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {['mobile', 'desktop'].map((k) => (
          <div key={k} className="flex items-center gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">
            <ScoreGauge score={reports[k].scores.performance} size={80} />
            <div className="text-sm">
              <p className="flex items-center gap-1.5 font-semibold capitalize">
                {k === 'mobile' ? <Smartphone size={15} /> : <Monitor size={15} />} {k}
              </p>
              <p className="text-slate-500">LCP {formatMetric('lcp', reports[k].lab.lcp.value)} · CLS {formatMetric('cls', reports[k].lab.cls.value)}</p>
              <p className="text-slate-500">TBT {formatMetric('tbt', reports[k].lab.tbt.value)} · {new Date(reports[k].createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Overview() {
  const { reports } = useApp();
  return (
    <RequireReport title="the overview">
      {(report) => {
        const summary = report.resources.summary;
        const pie = Object.entries(summary.byType || {})
          .map(([k, v]) => ({ name: TYPE_LABEL[k] || k, value: v.bytes, key: k }))
          .filter((x) => x.value > 0)
          .sort((a, b) => b.value - a.value);
        const counts = report.issueCounts || {};
        const top = report.issues.slice(0, 5);
        return (
          <div className="space-y-6">
            <section className="hero-surface animate-fade-up p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-fuchsia-400/30 blur-3xl" />
              <div className="relative grid items-center gap-8 xl:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Performance overview</p>
                  <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight sm:text-4xl">{(() => { try { return new URL(report.finalUrl).host; } catch { return report.finalUrl; } })()}</h1>
                  <p className="mt-1 truncate text-sm text-white/70" title={report.finalUrl}>{report.finalUrl}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {[report.strategy === 'mobile' ? 'Mobile' : 'Desktop', new Date(report.createdAt).toLocaleString(), report.platform?.label, report.sources.lighthouse ? `Lighthouse ${report.sources.lighthouseVersion || ''}` : 'Lighthouse unavailable', report.field ? 'Real-user data ✓' : 'No field data']
                      .filter(Boolean)
                      .map((t) => (
                        <span key={t} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-medium backdrop-blur">{t}</span>
                      ))}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link to="/suggestions"><Button variant="white" icon={Lightbulb}>View {report.issues.length} fixes</Button></Link>
                    <Link to={`/analyzer?url=${encodeURIComponent(report.finalUrl)}&strategy=${report.strategy}&run=1`}>
                      <Button variant="ghost" className="border border-white/30 text-white hover:bg-white/10 dark:text-white" icon={RefreshCw}>Retest</Button>
                    </Link>
                    <Link to="/analyzer"><Button variant="ghost" className="text-white/80 hover:bg-white/10 dark:text-white/80" icon={ScanSearch}>New scan</Button></Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur sm:grid-cols-4">
                  {[['Performance', report.scores.performance, '/core-web-vitals'], ['Accessibility', report.scores.accessibility, null], ['Best Practices', report.scores.bestPractices, null], ['SEO', report.scores.seo, '/seo']].map(([l, v, to], i) => {
                    const inner = (
                      <>
                        <div className="rounded-full bg-white p-1.5 shadow-lg transition group-hover:scale-105 dark:bg-slate-900">
                          <ScoreGauge score={v} size={i === 0 ? 96 : 80} />
                        </div>
                        <span className="text-xs font-medium text-white/85 group-hover:text-white">{l}{to ? ' →' : ''}</span>
                      </>
                    );
                    return to ? (
                      <Link key={l} to={to} className="group flex flex-col items-center gap-2" title={`Open ${l} details`}>{inner}</Link>
                    ) : (
                      <div key={l} className="flex flex-col items-center gap-2">{inner}</div>
                    );
                  })}
                </div>
              </div>
            </section>
            {report.warnings?.filter((w) => !w.startsWith('Lite scan (Vercel)')).length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc space-y-0.5 pl-4">
                  {report.warnings.filter((w) => !w.startsWith('Lite scan (Vercel)')).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}


            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white">Core Web Vitals</h2>
                <Link to="/core-web-vitals" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
                  Lab vs field details <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard metric="lcp" value={report.lab.lcp.value} compact />
                <MetricCard metric="cls" value={report.lab.cls.value} compact />
                {report.field?.metrics?.inp?.p75 !== undefined && report.field?.metrics?.inp?.p75 !== null ? (
                  <MetricCard metric="inp" value={report.field.metrics.inp.p75} source="field" compact note={`Real users, ${report.field.scope}-level`} />
                ) : (
                  <MetricCard metric="tbt" value={report.lab.tbt.value} compact note="INP field data unavailable – TBT is the lab proxy." />
                )}
                <MetricCard metric="fcp" value={report.lab.fcp.value} compact />
                <MetricCard metric="ttfb" value={report.lab.ttfb.value} compact note={report.lab.ttfb.note} />
                <MetricCard metric="si" value={report.lab.si.value} compact />
              </div>
            </div>

            <DeviceCompare reports={reports} />

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader
                  title="Top priority issues"
                  subtitle={`${report.issues.length} issues · ${counts.critical || 0} critical · ${counts.high || 0} high · ${counts.medium || 0} medium · ${counts.low || 0} low`}
                  actions={
                    <Link to="/suggestions">
                      <Button size="sm" variant="secondary">All suggestions</Button>
                    </Link>
                  }
                />
                <div className="space-y-3 p-4">
                  {top.length ? top.map((i) => <IssueCard key={i.id} issue={i} report={report} showCode={false} />) : <p className="p-4 text-sm text-slate-500">No issues detected.</p>}
                </div>
              </Card>
              <div className="space-y-6">
                <Card>
                  <CardHeader title="Page weight" subtitle={`${summary.requests} requests · ${summary.domains} domains`} />
                  <div className="p-4">
                    {pie.length ? (
                      <>
                        <div className="h-52">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                                {pie.map((p) => (
                                  <Cell key={p.key} fill={TYPE_COLORS[p.key] || '#94a3b8'} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => formatBytes(v)} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {pie.map((p) => (
                            <li key={p.key} className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[p.key] }} /> {p.name}
                              </span>
                              <span className="tabular-nums text-slate-500">{formatBytes(p.value)}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 border-t border-slate-100 pt-3 text-sm font-semibold dark:border-slate-800">Total {formatBytes(summary.bytes)}</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Request data unavailable.</p>
                    )}
                  </div>
                </Card>
                <Card className="p-5">
                  <p className="label">Platform</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{report.platform?.label || 'Unknown'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {report.platform?.theme && <Badge tone="brand">Theme: {report.platform.theme}</Badge>}
                    {report.platform?.builder && <Badge tone="violet">{report.platform.builder}</Badge>}
                    {report.platform?.cachePlugin && <Badge tone="green">{report.platform.cachePlugin}</Badge>}
                  </div>
                  {report.platform?.evidence?.length > 0 && <p className="mt-2 text-xs text-slate-500">Evidence: {report.platform.evidence.join(' · ')}</p>}
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Images" icon={ImageIcon} accent="blue" value={report.images.totals.count} hint={formatBytes(report.images.totals.bytes)} />
                  <Stat label="Scripts" icon={FileCode2} accent="amber" value={report.js.totals.count} hint={formatBytes(report.js.totals.bytes)} />
                  <Stat label="Stylesheets" icon={Palette} accent="pink" value={report.css.totals.count} hint={formatBytes(report.css.totals.bytes)} />
                  <Stat label="3rd parties" icon={Puzzle} accent="green" value={report.thirdParty.totals.count} hint={formatBytes(report.thirdParty.totals.bytes)} />
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </RequireReport>
  );
}
