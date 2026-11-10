import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Smartphone, Monitor, Lightbulb, RefreshCw, ScanSearch, Image as ImageIcon, FileCode2, Palette, Puzzle, Gauge, TrendingUp, Zap } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import RequireReport from '../components/RequireReport.jsx';
import ScoreGauge from '../components/ScoreGauge.jsx';
import MetricCard from '../components/MetricCard.jsx';
import IssueCard from '../components/IssueCard.jsx';
import Slider3D from '../components/Slider3D.jsx';
import GlowAreaChart from '../components/GlowAreaChart.jsx';
import { Card, CardHeader, Badge, Stat, Button, Notice, Tabs, cx } from '../components/ui.jsx';
import { formatBytes, formatMetric } from '@speedlab/shared/format';
import { rateMetric } from '@speedlab/shared/thresholds';

const TYPE_COLORS = { image: '#c2ee2a', js: '#f59e0b', css: '#2dd4bf', font: '#0ea5e9', media: '#a3e635', document: '#14b8a6', xhr: '#64748b', other: '#94a3b8' };
const TYPE_LABEL = { image: 'Images', js: 'JavaScript', css: 'CSS', font: 'Fonts', media: 'Video/Audio', document: 'HTML', xhr: 'XHR/Fetch', other: 'Other' };
const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

/** Big thin number with a small unit, e.g. 28.6 km/h. */
function BigValue({ metric, value, className }) {
  if (value === null || value === undefined) return <span className={cx('num text-white/40', className)}>—</span>;
  const [num, unit] = formatMetric(metric, value).split(' ');
  const rating = rateMetric(metric, value);
  return (
    <span className={cx('num', className)}>
      <span className={rating === 'poor' ? 'text-[#ff7a6e]' : rating === 'needs-improvement' ? 'text-[#ffc14d]' : 'text-white'}>{num}</span>
      {unit && <span className="ml-1 text-base font-normal text-white/50">{unit}</span>}
    </span>
  );
}

function Hero({ report }) {
  const s = report.scores;
  const inp = report.field?.metrics?.inp?.p75 ?? null;
  return (
    <section className="hero-surface animate-fade-up p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative grid gap-8 xl:grid-cols-[1.1fr_1fr] xl:items-center">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-brand-300">Performance</p>
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white/80">
              {report.strategy === 'mobile' ? <Smartphone size={12} /> : <Monitor size={12} />} {new Date(report.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="num text-7xl text-white sm:text-8xl">{s.performance ?? '—'}</span>
            <span className="text-xl text-white/50">/100</span>
          </p>
          <h1 className="mt-1 truncate text-lg font-medium text-white/90" title={report.finalUrl}>{host(report.finalUrl)}</h1>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-white/10 pt-5 sm:grid-cols-4">
            {[
              ['LCP', <BigValue key="l" metric="lcp" value={report.lab.lcp.value} className="text-3xl" />],
              ['CLS', <BigValue key="c" metric="cls" value={report.lab.cls.value} className="text-3xl" />],
              inp !== null ? ['INP (real users)', <BigValue key="i" metric="inp" value={inp} className="text-3xl" />] : ['TBT', <BigValue key="t" metric="tbt" value={report.lab.tbt.value} className="text-3xl" />],
              ['Page weight', <span key="w" className="num text-3xl text-white">{formatBytes(report.resources.summary.bytes).split(' ')[0]}<span className="ml-1 text-base font-normal text-white/50">{formatBytes(report.resources.summary.bytes).split(' ')[1]}</span></span>],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-white/55">{label}</p>
                <p className="mt-1">{val}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link to="/suggestions"><Button variant="white" icon={Lightbulb}>View {report.issues.length} fixes</Button></Link>
            <Link to={`/analyzer?url=${encodeURIComponent(report.finalUrl)}&strategy=${report.strategy}&base=${report.id || ''}&run=1`}>
              <Button variant="ghost" className="glass text-white hover:bg-white/15 dark:text-white" icon={RefreshCw}>Retest</Button>
            </Link>
            <Link to="/analyzer"><Button variant="ghost" className="text-white/75 hover:bg-white/10 dark:text-white/75" icon={ScanSearch}>New scan</Button></Link>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-brand-400/10 blur-2xl" />
            <div className="[&_.text-slate-900]:text-white">
              <ScoreGauge score={s.performance} size={230} />
            </div>
            <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-white/55">Performance score</p>
          </div>
          <div className="grid w-full max-w-md grid-cols-3 gap-3">
            {[['Accessibility', s.accessibility, null], ['Best Practices', s.bestPractices, null], ['SEO', s.seo, '/seo']].map(([l, v, to]) => {
              const inner = (
                <div className="glass flex flex-col items-center rounded-2xl p-3 transition hover:bg-white/15 [&_.text-slate-900]:text-white [&_.text-slate-600]:text-white/70">
                  <ScoreGauge score={v} size={70} />
                  <span className="mt-1 text-[11px] font-medium text-white/75">{l}{to ? ' →' : ''}</span>
                </div>
              );
              return to ? <Link key={l} to={to}>{inner}</Link> : <div key={l}>{inner}</div>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

const TREND_METRICS = [
  { key: 'performance', label: 'Performance', field: 'performance', unit: '', reference: 90, refLabel: 'Good ≥ 90', domain: [0, 100] },
  { key: 'lcp', label: 'LCP', field: 'lcp_ms', unit: 's', reference: 2.5, refLabel: 'Good ≤ 2.5 s', scale: 1000 },
  { key: 'cls', label: 'CLS', field: 'cls', unit: '', reference: 0.1, refLabel: 'Good ≤ 0.1' },
  { key: 'tbt', label: 'TBT', field: 'tbt_ms', unit: 'ms', reference: 200, refLabel: 'Good ≤ 200 ms' },
];

function Trend({ report }) {
  const [rows, setRows] = useState(null);
  const [metric, setMetric] = useState('performance');
  useEffect(() => {
    let cancel = false;
    api(`/scans?url=${encodeURIComponent(host(report.finalUrl))}&strategy=${report.strategy}&limit=40`)
      .then((r) => !cancel && setRows(r.rows.filter((x) => (x.final_url || x.url) === report.finalUrl)))
      .catch(() => !cancel && setRows([]));
    return () => {
      cancel = true;
    };
  }, [report.finalUrl, report.strategy, report.id]);
  const m = TREND_METRICS.find((t) => t.key === metric);
  const data = useMemo(
    () =>
      (rows || [])
        .filter((r) => typeof r[m.field] === 'number')
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .map((r) => ({ label: new Date(r.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }), value: m.scale ? Math.round((r[m.field] / m.scale) * 100) / 100 : Math.round(r[m.field] * 1000) / 1000 })),
    [rows, m],
  );
  const last = data[data.length - 1]?.value;
  const first = data[0]?.value;
  const delta = data.length > 1 ? last - first : null;
  const better = delta === null ? null : metric === 'performance' ? delta > 0 : delta < 0;
  return (
    <Card>
      <CardHeader
        icon={TrendingUp}
        title="Performance trend"
        subtitle={`${host(report.finalUrl)} · ${report.strategy} · ${data.length} scan${data.length === 1 ? '' : 's'} (measured)`}
        actions={<Tabs tabs={TREND_METRICS.map((t) => ({ key: t.key, label: t.label }))} value={metric} onChange={setMetric} />}
      />
      <div className="p-5">
        {rows === null ? (
          <div className="skeleton h-56 rounded-2xl bg-slate-100 dark:bg-white/[0.04]" />
        ) : data.length < 2 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 text-center dark:border-white/10">
            <Zap size={22} className="text-brand-500" />
            <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">The trend appears after two or more scans of this URL. Fix an issue, then press Retest to see your progress here.</p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="num text-4xl text-slate-900 dark:text-white">{last}<span className="ml-1 text-base font-normal text-slate-400">{m.unit}</span></span>
              {delta !== null && (
                <span className={cx('text-sm font-medium', better ? 'text-emerald-500' : delta === 0 ? 'text-slate-400' : 'text-red-500')}>
                  {delta > 0 ? '+' : ''}{Math.round(delta * 100) / 100}{m.unit} since first scan
                </span>
              )}
            </div>
            <div className="text-slate-500 dark:text-slate-300">
              <GlowAreaChart data={data} reference={m.reference} referenceLabel={m.refLabel} unit={m.unit} domain={m.domain || ['auto', 'auto']} height={240} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function DeviceCompare({ reports }) {
  if (!reports.mobile || !reports.desktop) return null;
  return (
    <Card>
      <CardHeader title="Mobile vs Desktop" subtitle="Separate Lighthouse runs" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {['mobile', 'desktop'].map((k) => (
          <div key={k} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.03]">
            <ScoreGauge score={reports[k].scores.performance} size={84} />
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
        const inp = report.field?.metrics?.inp?.p75;
        const vitals = [
          { key: 'fcp', label: 'FCP', props: { metric: 'fcp', value: report.lab.fcp.value } },
          { key: 'lcp', label: 'LCP', props: { metric: 'lcp', value: report.lab.lcp.value } },
          { key: 'cls', label: 'CLS', props: { metric: 'cls', value: report.lab.cls.value } },
          inp !== undefined && inp !== null
            ? { key: 'inp', label: 'INP', props: { metric: 'inp', value: inp, source: 'field', note: `Real users, ${report.field.scope}-level` } }
            : { key: 'tbt', label: 'TBT', props: { metric: 'tbt', value: report.lab.tbt.value, note: 'INP field data unavailable – TBT is the lab proxy.' } },
          { key: 'ttfb', label: 'TTFB', props: { metric: 'ttfb', value: report.lab.ttfb.value, note: report.lab.ttfb.note } },
          { key: 'si', label: 'Speed Index', props: { metric: 'si', value: report.lab.si.value } },
        ];
        return (
          <div className="space-y-6">
            <Hero report={report} />
            {report.warnings?.filter((w) => !w.startsWith('Lite scan (Vercel)')).length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc space-y-0.5 pl-4">
                  {report.warnings.filter((w) => !w.startsWith('Lite scan (Vercel)')).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}

            <div className="grid gap-6 2xl:grid-cols-[1fr_1.15fr]">
              <Card className="overflow-hidden">
                <CardHeader
                  icon={Gauge}
                  title="Core Web Vitals"
                  subtitle="Swipe, drag or use ← → to browse"
                  actions={
                    <Link to="/core-web-vitals" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-300">
                      Lab vs field <ArrowRight size={14} />
                    </Link>
                  }
                />
                <div className="px-2 pb-5 pt-3">
                  <Slider3D items={vitals} initial={1} label="Core Web Vitals" height={300} cardWidth={280} renderItem={(v) => <MetricCard {...v.props} compact />} />
                </div>
              </Card>
              <Trend report={report} />
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
                        <div className="relative h-52">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={84} paddingAngle={3} cornerRadius={6} stroke="none">
                                {pie.map((p) => (
                                  <Cell key={p.key} fill={TYPE_COLORS[p.key] || '#94a3b8'} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => formatBytes(v)} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="num text-2xl text-slate-900 dark:text-white">{formatBytes(summary.bytes)}</span>
                            <span className="text-[11px] text-slate-500">total</span>
                          </div>
                        </div>
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {pie.map((p) => (
                            <li key={p.key} className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[p.key], boxShadow: `0 0 8px ${TYPE_COLORS[p.key]}` }} /> {p.name}
                              </span>
                              <span className="tabular-nums text-slate-500">{formatBytes(p.value)}</span>
                            </li>
                          ))}
                        </ul>
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
                    {report.platform?.builder && <Badge tone="blue">{report.platform.builder}</Badge>}
                    {report.platform?.cachePlugin && <Badge tone="green">{report.platform.cachePlugin}</Badge>}
                  </div>
                  {report.platform?.evidence?.length > 0 && <p className="mt-2 text-xs text-slate-500">Evidence: {report.platform.evidence.join(' · ')}</p>}
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Images" icon={ImageIcon} accent="brand" value={report.images.totals.count} hint={formatBytes(report.images.totals.bytes)} />
                  <Stat label="Scripts" icon={FileCode2} accent="amber" value={report.js.totals.count} hint={formatBytes(report.js.totals.bytes)} />
                  <Stat label="Stylesheets" icon={Palette} accent="blue" value={report.css.totals.count} hint={formatBytes(report.css.totals.bytes)} />
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
