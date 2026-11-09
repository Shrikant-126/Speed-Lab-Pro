import { useCallback, useEffect, useState } from 'react';
import { FileText, Download, Trash2, FileDown } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { generatePdfReport } from '../lib/pdf.js';
import { Card, CardHeader, PageHeader, Button, Select, ErrorState, EmptyState, Skeleton, Notice } from '../components/ui.jsx';
import { shortUrl } from '@speedlab/shared/format';

const label = (s) => `${shortUrl(s.final_url || s.url, 50)} · ${s.strategy} · ${new Date(s.created_at).toLocaleString()} · perf ${s.performance ?? '—'}`;

export default function Reports() {
  const { report } = useApp();
  const [scans, setScans] = useState(null);
  const [saved, setSaved] = useState(null);
  const [scanId, setScanId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([api('/scans?limit=200'), api('/reports')]);
      setScans(s.rows);
      setSaved(r);
      setScanId((cur) => cur || (report?.id && s.rows.some((x) => x.id === report.id) ? report.id : s.rows[0]?.id || ''));
    } catch (e) {
      setError(e.message);
      setScans([]);
      setSaved([]);
    }
  }, [report?.id]);
  useEffect(() => {
    load();
  }, [load]);

  const build = async (sid, cid, t, record) => {
    const full = await api(`/scans/${sid}`);
    let compare = null;
    if (cid) {
      const res = await api(`/scans/compare?a=${cid}&b=${sid}`);
      compare = res;
    }
    const doc = await generatePdfReport({ report: full, compare });
    const host = (() => {
      try {
        return new URL(full.finalUrl).host;
      } catch {
        return 'site';
      }
    })();
    doc.save(`speedlab-${host}-${full.strategy}-${new Date(full.createdAt).toISOString().slice(0, 10)}.pdf`);
    if (record) await api('/reports', { method: 'POST', body: { scanId: sid, compareScanId: cid || null, title: t || `Performance report – ${host}` } });
  };

  const generate = async () => {
    if (!scanId) return;
    setBusy('new');
    setError(null);
    try {
      await build(scanId, compareId, title, true);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const options = (scans || []).map((s) => ({ value: s.id, label: label(s) }));

  return (
    <div className="space-y-6">
      <PageHeader icon={FileText} title="Reports" description="Generate professional PDF reports with scores, Core Web Vitals, LCP breakdown, issues by category, prioritised recommendations and optional before/after comparison." />
      {error && <ErrorState message={error} onRetry={load} />}
      <Card>
        <CardHeader title="Generate PDF report" icon={FileDown} />
        <div className="space-y-4 p-5">
          {scans === null ? (
            <Skeleton className="h-32" />
          ) : !scans.length ? (
            <EmptyState title="No saved scans" description="Run a scan first – reports are generated from saved scans." />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <span className="label">Scan</span>
                  <Select className="w-full" value={scanId} onChange={setScanId} options={options} />
                </div>
                <div>
                  <span className="label">Compare with baseline (optional)</span>
                  <Select className="w-full" value={compareId} onChange={setCompareId} options={[{ value: '', label: 'No comparison' }, ...options.filter((o) => o.value !== scanId)]} />
                </div>
              </div>
              <div>
                <span className="label">Report title</span>
                <input className="input" maxLength={200} placeholder="Performance report – example.com" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              {compareId && <Notice>The comparison section shows measured results of both scans; estimated savings are labelled separately.</Notice>}
              <Button icon={Download} loading={busy === 'new'} onClick={generate} disabled={!scanId}>
                Generate & download PDF
              </Button>
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Generated reports" subtitle="Reports are regenerated from the stored scan data when downloaded again" />
        <div className="overflow-x-auto">
          {saved === null ? (
            <div className="p-5"><Skeleton className="h-24" /></div>
          ) : !saved.length ? (
            <p className="p-5 text-sm text-slate-500">No reports generated yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Created</th>
                  <th>Comparison</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.title}</td>
                    <td className="whitespace-nowrap text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.compare_scan_id ? 'Yes' : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        loading={busy === r.id}
                        onClick={async () => {
                          setBusy(r.id);
                          setError(null);
                          try {
                            await build(r.scan_id, r.compare_scan_id, r.title, false);
                          } catch (e) {
                            setError(e.status === 404 ? 'The scan for this report was deleted.' : e.message);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        PDF
                      </Button>{' '}
                      <Button
                        size="sm"
                        variant="danger-outline"
                        icon={Trash2}
                        onClick={async () => {
                          if (!window.confirm('Delete this report entry?')) return;
                          await api(`/reports/${r.id}`, { method: 'DELETE' }).catch((e) => setError(e.message));
                          load();
                        }}
                        aria-label="Delete report"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
