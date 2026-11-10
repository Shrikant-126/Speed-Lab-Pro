import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { History as HistoryIcon, Trash2, ExternalLink, GitCompare, Search, FolderPlus, X, Smartphone, Monitor, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { METRICS } from '@speedlab/shared/thresholds';
import { formatBytes, formatMetric, shortUrl } from '@speedlab/shared/format';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { PageHeader, Card, CardHeader, Button, Select, EmptyState, ErrorState, Skeleton, Badge, Notice, SourceTag, scoreRating, RATING_COLOR, cx } from '../components/ui.jsx';

const PAGE = 20;
const SCORE_LABEL = { performance: 'Performance', accessibility: 'Accessibility', bestPractices: 'Best Practices', seo: 'SEO' };
const WEIGHT_LABEL = { image: 'Images', js: 'JavaScript', css: 'CSS', font: 'Fonts', media: 'Media', document: 'HTML', total: 'Total' };

function Delta({ value, lowerBetter = true, format = (v) => v }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  if (value === 0) return <span className="text-slate-500">±0</span>;
  const good = lowerBetter ? value < 0 : value > 0;
  return <span className={good ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-red-600 dark:text-red-400'}>{value > 0 ? '+' : '−'}{format(Math.abs(value))}</span>;
}

function Comparison({ data, onClose }) {
  const { a, b, comparison: c } = data;
  const weightChart = c.weights.filter((w) => ['image', 'js', 'css', 'total'].includes(w.key)).map((w) => ({ name: WEIGHT_LABEL[w.key], Before: w.before ? Math.round(w.before / 1024) : 0, After: w.after ? Math.round(w.after / 1024) : 0 }));
  return (
    <Card>
      <CardHeader icon={GitCompare} title="Before / after comparison" subtitle={`${new Date(a.createdAt).toLocaleString()} → ${new Date(b.createdAt).toLocaleString()}`} actions={<Button size="sm" variant="ghost" icon={X} onClick={onClose}>Close</Button>} />
      <div className="space-y-6 p-5">
        <Notice>
          All values below are <strong>measured</strong> results from the two scans. Lab metrics vary between runs (network, server load), so small differences may be noise.
          {!c.sameUrl && ' Note: the scans are for different URLs.'}
          {!c.sameStrategy && ' Note: the scans use different devices (mobile vs desktop).'}
        </Notice>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {c.scores.map((s) => (
            <div key={s.key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase text-slate-500">{SCORE_LABEL[s.key]}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                <span style={{ color: RATING_COLOR[scoreRating(s.before)] }}>{s.before ?? '—'}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span style={{ color: RATING_COLOR[scoreRating(s.after)] }}>{s.after ?? '—'}</span>
              </p>
              <p className="text-sm"><Delta value={s.delta} lowerBetter={false} /></p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
            <thead><tr><th>Metric (lab)</th><th className="text-right">Before</th><th className="text-right">After</th><th className="text-right">Change</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {c.metrics.map((m) => (
                <tr key={m.key}>
                  <td>{METRICS[m.key]?.label || m.key}</td>
                  <td className="text-right tabular-nums">{formatMetric(m.key, m.before)}</td>
                  <td className="text-right tabular-nums">{formatMetric(m.key, m.after)}</td>
                  <td className="text-right tabular-nums"><Delta value={m.delta} format={(v) => formatMetric(m.key, v)} /></td>
                  <td className="text-right tabular-nums">{m.percent == null ? '—' : <Delta value={Math.round(m.percent)} format={(v) => `${v}%`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={weightChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} unit=" KB" width={70} />
                <Tooltip formatter={(v) => `${v} KB`} />
                <Legend />
                <Bar dataKey="Before" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="After" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Resource weight</th><th className="text-right">Before</th><th className="text-right">After</th><th className="text-right">Change</th></tr></thead>
              <tbody>
                {c.weights.map((w) => (
                  <tr key={w.key}>
                    <td>{WEIGHT_LABEL[w.key]}</td>
                    <td className="text-right tabular-nums">{formatBytes(w.before)}</td>
                    <td className="text-right tabular-nums">{formatBytes(w.after)}</td>
                    <td className="text-right tabular-nums"><Delta value={w.delta} format={(v) => formatBytes(v)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="label">Resolved issue types ({c.issues.resolved.length})</p>
            <div className="flex flex-wrap gap-1.5">{c.issues.resolved.length ? c.issues.resolved.map((t) => <Badge key={t} tone="green">{t}</Badge>) : <span className="text-sm text-slate-500">None</span>}</div>
          </div>
          <div>
            <p className="label">New issue types ({c.issues.introduced.length})</p>
            <div className="flex flex-wrap gap-1.5">{c.issues.introduced.length ? c.issues.introduced.map((t) => <Badge key={t} tone="red">{t}</Badge>) : <span className="text-sm text-slate-500">None</span>}</div>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <SourceTag kind="estimate" /> Potential savings identified in the baseline scan: {formatBytes(c.estimatedSavingsBefore.bytes)} — {c.estimatedSavingsBefore.label}. Issues: {c.issues.before} → {c.issues.after}.
        </p>
      </div>
    </Card>
  );
}

function Projects({ projects, reload }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/projects', { method: 'POST', body: { name, url } });
      setName('');
      setUrl('');
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this project? Its scans are kept but unassigned.')) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Card>
      <CardHeader icon={FolderPlus} title="Website projects" subtitle="Group scans by website" />
      <div className="space-y-4 p-5">
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <input className="input min-w-[160px] flex-1" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          <input className="input min-w-[200px] flex-[2]" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <Button type="submit" loading={busy}>Add project</Button>
        </form>
        {error && <ErrorState message={error} />}
        {projects === null ? <Skeleton className="h-10" /> : projects.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><p className="font-medium">{p.name}</p><p className="truncate text-xs text-slate-500">{p.url}</p></div>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(p.id)} aria-label="Delete project" />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No projects yet.</p>}
      </div>
    </Card>
  );
}

export default function History() {
  const { loadScan, scanning } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState([]);
  const [compare, setCompare] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [projects, setProjects] = useState(null);
  const [opening, setOpening] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      if (query) params.set('url', query);
      if (strategy) params.set('strategy', strategy);
      if (projectId) params.set('projectId', projectId);
      const r = await api(`/scans?${params}`);
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setError(e.message);
    }
  }, [page, query, strategy, projectId]);
  useEffect(() => { load(); }, [load]);
  const loadProjects = useCallback(() => api('/projects').then(setProjects).catch(() => setProjects([])), []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));
  const open = async (id) => {
    setOpening(id);
    try {
      await loadScan(id);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setOpening(null);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this scan permanently?')) return;
    try {
      await api(`/scans/${id}`, { method: 'DELETE' });
      setSelected((s) => s.filter((x) => x !== id));
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const compareIds = async (a, b) => {
    setComparing(true);
    setError(null);
    try {
      setCompare(await api(`/scans/compare?a=${a}&b=${b}`));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
    } finally {
      setComparing(false);
    }
  };
  const runCompare = async () => {
    const sorted = rows.filter((r) => selected.includes(r.id)).sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
    const ids = sorted.length === 2 ? sorted.map((r) => r.id) : selected;
    await compareIds(ids[0], ids[1]);
  };
  // /history?a=<before>&b=<after> opens the comparison directly (used after a retest).
  useEffect(() => {
    const a = params.get('a');
    const b = params.get('b');
    if (a && b && /^[0-9a-f-]{36}$/i.test(a) && /^[0-9a-f-]{36}$/i.test(b)) {
      setSelected([a, b]);
      compareIds(a, b);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const retest = (r) => navigate(`/analyzer?url=${encodeURIComponent(r.final_url || r.url)}&strategy=${r.strategy}&base=${r.id}&run=1`);

  return (
    <div className="space-y-6">
      <PageHeader icon={HistoryIcon} title="Scan History" description="All saved scans. Select two scans to compare before/after results." actions={<Button icon={GitCompare} disabled={selected.length !== 2} loading={comparing} onClick={runCompare}>Compare selected ({selected.length}/2)</Button>} />
      {compare && <Comparison data={compare} onClose={() => setCompare(null)} />}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <form className="relative min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(q.trim()); }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Filter by URL (press Enter)" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <Select value={strategy} onChange={(v) => { setPage(0); setStrategy(v); }} options={[{ value: '', label: 'All devices' }, { value: 'mobile', label: 'Mobile' }, { value: 'desktop', label: 'Desktop' }]} />
          <Select value={projectId} onChange={(v) => { setPage(0); setProjectId(v); }} options={[{ value: '', label: 'All projects' }, ...(projects || []).map((p) => ({ value: p.id, label: p.name }))]} />
        </div>
        {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}
        {rows === null && !error ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows && !rows.length ? (
          <div className="p-5"><EmptyState icon={HistoryIcon} title="No scans found" description="Scans you run are saved here automatically." /></div>
        ) : rows ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[900px]">
              <thead>
                <tr><th /><th>URL</th><th>Device</th><th>Date</th><th className="text-right">Perf.</th><th className="text-right">LCP</th><th className="text-right">CLS</th><th className="text-right">TBT</th><th className="text-right">Weight</th><th className="text-right">Issues</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cx(selected.includes(r.id) && 'bg-brand-50/60 dark:bg-brand-500/5')}>
                    <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Select for comparison" /></td>
                    <td className="max-w-[260px]"><p className="truncate font-medium" title={r.final_url || r.url}>{shortUrl(r.final_url || r.url, 50)}</p>{r.platform && <p className="text-xs text-slate-500">{r.platform}</p>}</td>
                    <td>{r.strategy === 'mobile' ? <Smartphone size={15} /> : <Monitor size={15} />}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: RATING_COLOR[scoreRating(r.performance)] }}>{r.performance ?? '—'}</td>
                    <td className="text-right tabular-nums">{formatMetric('lcp', r.lcp_ms)}</td>
                    <td className="text-right tabular-nums">{formatMetric('cls', r.cls)}</td>
                    <td className="text-right tabular-nums">{formatMetric('tbt', r.tbt_ms)}</td>
                    <td className="text-right tabular-nums">{formatBytes(r.total_bytes)}</td>
                    <td className="text-right tabular-nums">{r.issue_count ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="secondary" icon={ExternalLink} loading={opening === r.id} onClick={() => open(r.id)}>Open</Button>{' '}
                      <Button size="sm" variant="secondary" icon={RotateCcw} disabled={scanning} onClick={() => retest(r)} title="Scan this URL again">Retest</Button>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r.id)} aria-label="Delete scan" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {total > PAGE && (
          <div className="flex items-center justify-between gap-2 p-4 text-sm">
            <span className="text-slate-500">Page {page + 1} of {Math.ceil(total / PAGE)} · {total} scans</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <Projects projects={projects} reload={loadProjects} />
    </div>
  );
}
