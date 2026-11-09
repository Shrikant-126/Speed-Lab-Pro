import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Search, Trash2, Bookmark } from 'lucide-react';
import { PRIORITY_WEIGHT } from '@speedlab/shared/thresholds';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { PageHeader, Tabs, Select, EmptyState, ErrorState, Skeleton, PriorityBadge, Button, Card, Badge } from '../components/ui.jsx';

const PRIO = ['critical', 'high', 'medium', 'low'];
const PRIO_STYLE = {
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
};

function IssuesView({ report }) {
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');
  const [metric, setMetric] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('priority');
  const issues = report.issues || [];
  const categories = [...new Set(issues.map((i) => i.category))];
  const metrics = [...new Set(issues.flatMap((i) => i.metrics || []))];
  const list = useMemo(() => {
    let l = issues;
    if (priority !== 'all') l = l.filter((i) => i.priority === priority);
    if (category !== 'all') l = l.filter((i) => i.category === category);
    if (metric !== 'all') l = l.filter((i) => (i.metrics || []).includes(metric));
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((i) => `${i.title} ${i.description} ${i.resource || ''}`.toLowerCase().includes(s));
    }
    const sorted = [...l];
    if (sort === 'ms') sorted.sort((a, b) => (b.savings?.ms || 0) - (a.savings?.ms || 0));
    else if (sort === 'bytes') sorted.sort((a, b) => (b.savings?.bytes || 0) - (a.savings?.bytes || 0));
    else if (sort === 'category') sorted.sort((a, b) => a.category.localeCompare(b.category) || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
    else sorted.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
    return sorted;
  }, [issues, priority, category, metric, q, sort]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {PRIO.map((p) => (
          <button key={p} type="button" onClick={() => setPriority(priority === p ? 'all' : p)} className={`rounded-xl border p-4 text-left transition ${PRIO_STYLE[p]} ${priority === p ? 'ring-2 ring-current' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wide capitalize">{p}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{report.issueCounts?.[p] || 0}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search issues, URLs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={priority} onChange={setPriority} options={[{ value: 'all', label: 'All priorities' }, ...PRIO.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))]} />
        <Select value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
        <Select value={metric} onChange={setMetric} options={[{ value: 'all', label: 'All metrics' }, ...metrics.map((m) => ({ value: m, label: m }))]} />
        <Select value={sort} onChange={setSort} options={[{ value: 'priority', label: 'Sort: priority' }, { value: 'ms', label: 'Sort: time saving' }, { value: 'bytes', label: 'Sort: byte saving' }, { value: 'category', label: 'Sort: category' }]} />
      </div>
      <p className="text-sm text-slate-500">{list.length} of {issues.length} issues · Savings are labelled as measured, Lighthouse estimates or estimates.</p>
      {list.length ? list.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title={issues.length ? 'No issues match these filters' : 'No issues detected'} className="py-10" />}
    </div>
  );
}

function SavedView() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setError(null);
    api('/recommendations').then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, []);
  const update = async (id, status) => {
    try {
      const row = await api(`/recommendations/${id}`, { method: 'PATCH', body: { status } });
      setRows((r) => r.map((x) => (x.id === id ? row : x)));
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this saved recommendation?')) return;
    try {
      await api(`/recommendations/${id}`, { method: 'DELETE' });
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (!rows.length) return <EmptyState icon={Bookmark} title="No saved recommendations" description="Open an issue and click “Save recommendation” to build your fix list." />;
  return (
    <Card className="overflow-x-auto">
      <table className="table min-w-[720px]">
        <thead>
          <tr><th>Recommendation</th><th>Priority</th><th>Saved</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <p className="font-medium text-slate-900 dark:text-white">{r.title}</p>
                <p className="text-xs text-slate-500">{r.issue?.solution}</p>
              </td>
              <td><PriorityBadge priority={r.priority} /></td>
              <td className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
              <td>
                <Select value={r.status} onChange={(v) => update(r.id, v)} options={['open', 'in-progress', 'done', 'dismissed'].map((s) => ({ value: s, label: s }))} />
              </td>
              <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r.id)} aria-label="Delete" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function Suggestions() {
  const [tab, setTab] = useState('issues');
  const { report } = useApp();
  return (
    <div>
      <PageHeader icon={Lightbulb} title="Optimization Suggestions" description="Evidence-based issues with root cause, impact, priority and copy-ready fixes." actions={<Tabs tabs={[{ key: 'issues', label: 'Scan issues', count: report?.issues?.length }, { key: 'saved', label: 'Saved' }]} value={tab} onChange={setTab} />} />
      {tab === 'saved' ? <SavedView /> : <RequireReport title="suggestions">{(r) => <IssuesView report={r} />}</RequireReport>}
      {tab === 'issues' && report && <p className="mt-6 text-xs text-slate-400"><Badge tone="slate">Tip</Badge> Use the Code Generator for platform-specific (Shopify / WordPress) variants.</p>}
    </div>
  );
}
