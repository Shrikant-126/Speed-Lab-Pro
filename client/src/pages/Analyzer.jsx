import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles, Globe, Gauge, Code2, ShieldCheck, ScanSearch, Smartphone, Monitor, Layers, XCircle, CheckCircle2, Circle, Loader2, MinusCircle, AlertTriangle, ArrowRight, Ban, RotateCcw, GitCompare } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, ProgressBar, ErrorState, Notice, Badge, IconChip, cx } from '../components/ui.jsx';
import ScoreGauge from '../components/ScoreGauge.jsx';
import { formatMetric } from '@speedlab/shared/format';
import { rateMetric } from '@speedlab/shared/thresholds';

const STEP_ICON = {
  pending: <Circle size={16} className="text-slate-300 dark:text-slate-600" />,
  running: <Loader2 size={16} className="animate-spin text-brand-600" />,
  done: <CheckCircle2 size={16} className="text-emerald-500" />,
  skipped: <MinusCircle size={16} className="text-slate-400" />,
  error: <AlertTriangle size={16} className="text-amber-500" />,
  cancelled: <Ban size={16} className="text-slate-400" />,
};

function JobProgress({ job }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {job.strategy === 'mobile' ? <Smartphone size={16} /> : <Monitor size={16} />}
          <span className="font-semibold capitalize">{job.strategy}</span>
          <Badge tone={job.status === 'done' ? 'green' : job.status === 'error' ? 'red' : job.status === 'cancelled' ? 'slate' : 'brand'}>{job.status}</Badge>
        </div>
        <span className="text-sm tabular-nums text-slate-500">{job.progress}%</span>
      </div>
      <ProgressBar value={job.progress} tone={job.status === 'error' ? 'bg-red-500' : job.status === 'done' ? 'bg-emerald-500' : 'brand'} />
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {job.status === 'queued' && job.queuePosition ? `Queued (position ${job.queuePosition})` : job.message}
      </p>
      <ul className="mt-4 space-y-2">
        {job.steps?.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm">
            {STEP_ICON[s.status] || STEP_ICON.pending}
            <span className={cx(s.status === 'pending' && 'text-slate-400')}>{s.label}</span>
            {s.status === 'skipped' && <span className="text-xs text-slate-400">(not available)</span>}
          </li>
        ))}
      </ul>
      {job.error && <ErrorState title="Scan failed" message={job.error.message} />}
      {job.warnings?.filter((w) => !w.startsWith('Lite scan (Vercel)')).length > 0 && (
        <div className="mt-4 space-y-2">
          {job.warnings.filter((w) => !w.startsWith('Lite scan (Vercel)')).map((w) => (
            <Notice key={w} tone="warn">{w}</Notice>
          ))}
        </div>
      )}
    </Card>
  );
}

function ResultSummary({ report, baselineId, onRetest, scanning }) {
  if (!report) return null;
  const s = report.scores;
  return (
    <Card>
      <CardHeader
        title={<span className="capitalize">{report.strategy} results</span>}
        subtitle={`${report.finalUrl} · ${new Date(report.createdAt).toLocaleString()}`}
        icon={report.strategy === 'mobile' ? Smartphone : Monitor}
        actions={
          <>
            {baselineId && report.id && baselineId !== report.id && (
              <Link to={`/history?a=${baselineId}&b=${report.id}`}>
                <Button size="sm" icon={GitCompare}>Compare with previous scan</Button>
              </Link>
            )}
            <Button size="sm" variant="secondary" icon={RotateCcw} disabled={scanning} onClick={() => onRetest(report)}>
              Retest
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <ScoreGauge score={s.performance} label="Performance" />
        <ScoreGauge score={s.accessibility} label="Accessibility" />
        <ScoreGauge score={s.bestPractices} label="Best Practices" />
        <ScoreGauge score={s.seo} label="SEO" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-5 text-sm sm:grid-cols-3 lg:grid-cols-6 dark:border-slate-800">
        {['lcp', 'fcp', 'ttfb', 'cls', 'tbt', 'si'].map((k) => {
          const v = report.lab[k]?.value;
          const r = rateMetric(k, v);
          return (
            <div key={k}>
              <p className="text-xs font-semibold uppercase text-slate-500">{k}</p>
              <p className={cx('font-semibold tabular-nums', r === 'good' ? 'text-emerald-600' : r === 'poor' ? 'text-red-500' : r === 'needs-improvement' ? 'text-amber-500' : 'text-slate-400')}>{formatMetric(k, v)}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">
        <span>
          Sources: Lighthouse {report.sources.lighthouse ? `(${report.sources.lighthouse === 'psi' ? 'PageSpeed Insights' : 'local'} ${report.sources.lighthouseVersion || ''})` : 'unavailable'} · Field {report.sources.field ? 'CrUX' : 'unavailable'} · Browser {report.sources.pageInspection ? 'Playwright' : 'unavailable'} · Images {report.sources.imageProbe ? 'Sharp' : 'unavailable'}
        </span>
        <Link to="/" className="inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">
          Open dashboard <ArrowRight size={13} />
        </Link>
      </div>
    </Card>
  );
}

export default function Analyzer() {
  const { startScan, cancelScan, resetScan, jobs, scanning, scanError, reports, defaultStrategy, health, baselines } = useApp();
  const [params, setParams] = useSearchParams();
  const [url, setUrl] = useState(() => params.get('url') || '');
  const [strategy, setStrategy] = useState(() => (['mobile', 'desktop', 'both'].includes(params.get('strategy')) ? params.get('strategy') : defaultStrategy || 'mobile'));
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const autoRan = useRef(null);

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const run = async (value, strat, baselineId) => {
    setLocalError(null);
    setSubmitting(true);
    try {
      await startScan({ url: value, strategy: strat, projectId, baselineId });
    } catch {
      /* scanError is set in context */
    } finally {
      setSubmitting(false);
    }
  };

  // /analyzer?url=…&strategy=…&run=1 starts a retest automatically (used by Retest buttons).
  useEffect(() => {
    const key = params.toString();
    if (params.get('run') !== '1' || !params.get('url') || autoRan.current === key || scanning) return;
    autoRan.current = key;
    const base = /^[0-9a-f-]{36}$/i.test(params.get('base') || '') ? params.get('base') : undefined;
    setParams({}, { replace: true });
    run(params.get('url'), strategy, base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const reset = () => {
    resetScan();
    setUrl('');
    setLocalError(null);
    setSubmitting(false);
    setStrategy(defaultStrategy || 'mobile');
    document.getElementById('url')?.focus();
  };

  const retest = (r) => {
    setUrl(r.finalUrl || r.url);
    setStrategy(r.strategy);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    run(r.finalUrl || r.url, r.strategy);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    const value = url.trim();
    if (!value) return setLocalError('Enter a website URL');
    try {
      const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!u.hostname.includes('.')) throw new Error();
    } catch {
      return setLocalError('Enter a valid public URL, e.g. https://example.com');
    }
    await run(value, strategy);
  };

  const doneStrategies = jobs.filter((j) => j.status === 'done').map((j) => j.strategy);
  const workerMissing = health?.worker?.mode === 'missing' || health?.worker?.ok === false;

  return (
    <div className="space-y-6">
      <section className="hero-surface animate-fade-up px-5 py-8 sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles size={13} /> Lighthouse · CrUX field data · Playwright · Sharp
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-[42px]">
            How fast is your website <span className="bg-gradient-to-r from-brand-200 via-brand-300 to-teal-200 bg-clip-text text-transparent">really?</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
            Get real Core Web Vitals, an exact LCP breakdown, and prioritised fixes with ready-to-paste HTML, CSS, JavaScript, Shopify Liquid and WordPress code.
          </p>
        </div>
        <form onSubmit={submit} className="relative mt-7 max-w-4xl space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/20 md:flex-row dark:bg-slate-900">
              <div className="flex flex-1 items-center gap-2 px-3">
                <Globe size={18} className="shrink-0 text-slate-400" />
                <label htmlFor="url" className="sr-only">Website URL</label>
                <input id="url" className="url-input w-full bg-transparent py-2.5 text-[15px] text-slate-900 placeholder-slate-400 outline-none dark:text-white" placeholder="https://www.yourstore.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={scanning} autoComplete="url" inputMode="url" />
              </div>
              {scanning ? (
                <Button variant="danger" size="lg" icon={XCircle} onClick={cancelScan}>Cancel scan</Button>
              ) : (
                <Button type="submit" size="lg" icon={ScanSearch} loading={submitting}>Analyze now</Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="lg"
              icon={RotateCcw}
              onClick={reset}
              disabled={!url && !jobs.length && !localError && !scanError}
              className="border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20 dark:text-white"
              title="Clear the URL, progress and errors"
            >
              Reset
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur" role="radiogroup" aria-label="Device">
              {[
                ['mobile', Smartphone, 'Mobile'],
                ['desktop', Monitor, 'Desktop'],
                ['both', Layers, 'Both'],
              ].map(([k, Icon, label]) => (
                <button key={k} type="button" role="radio" aria-checked={strategy === k} disabled={scanning} onClick={() => setStrategy(k)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', strategy === k ? 'bg-white text-brand-700 shadow' : 'text-white/80 hover:text-white')}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            {projects.length > 0 && (
              <select className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur outline-none [&>option]:text-slate-900" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={scanning} aria-label="Project">
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        </form>
      </section>
      {(localError || scanError) && <ErrorState title="Cannot start scan" message={localError || scanError} />}
      {health?.worker?.lite && (
        <Notice>
          <b>Online (Lite) mode:</b> scores, Core Web Vitals, real-user data, LCP, CSS/JS, third-party, SEO &amp; analytics checks all run here. Element-level browser checks (rendered image sizes, videos, event listeners) need the full local version (<code>npm run dev</code>).
        </Notice>
      )}
      {workerMissing && <Notice tone="warn">The scan worker is not available ({health?.worker?.error || 'WORKER_URL not configured'}). See Settings → System status.</Notice>}
      {health && health.integrations?.pagespeedApiKey === false && (
        <Notice>No PAGESPEED_API_KEY configured – PageSpeed Insights uses the small anonymous quota and may return HTTP 429. Add a key for reliable scans.</Notice>
      )}

      {jobs.length > 0 && (
        <div className={cx('grid gap-4', jobs.length > 1 && 'lg:grid-cols-2')}>
          {jobs.map((j) => (
            <JobProgress key={j.id} job={j} />
          ))}
        </div>
      )}

      {doneStrategies.map((s) => (
        <ResultSummary key={s} report={reports[s]} baselineId={baselines?.[s]} onRetest={retest} scanning={scanning} />
      ))}

      {jobs.length > 1 && reports.mobile && reports.desktop && doneStrategies.length === 2 && (
        <Card>
          <CardHeader title="Mobile vs Desktop" subtitle="Lab results from this scan" />
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Mobile</th>
                  <th>Desktop</th>
                </tr>
              </thead>
              <tbody>
                {[['performance', 'Performance score'], ['accessibility', 'Accessibility'], ['bestPractices', 'Best Practices'], ['seo', 'SEO']].map(([k, l]) => (
                  <tr key={k}>
                    <td>{l}</td>
                    <td className="tabular-nums">{reports.mobile.scores[k] ?? '—'}</td>
                    <td className="tabular-nums">{reports.desktop.scores[k] ?? '—'}</td>
                  </tr>
                ))}
                {['lcp', 'fcp', 'ttfb', 'cls', 'tbt', 'si'].map((k) => (
                  <tr key={k}>
                    <td className="uppercase">{k}</td>
                    <td className="tabular-nums">{formatMetric(k, reports.mobile.lab[k]?.value)}</td>
                    <td className="tabular-nums">{formatMetric(k, reports.desktop.lab[k]?.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!jobs.length && (reports.mobile || reports.desktop) && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip icon={RotateCcw} tone="blue" size={16} />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Made changes? Retest your last scan</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Run the same URL again and compare before vs after.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['mobile', 'desktop'].filter((k) => reports[k]).map((k) => (
                <Button key={k} variant="secondary" icon={k === 'mobile' ? Smartphone : Monitor} onClick={() => retest(reports[k])} title={reports[k].finalUrl}>
                  Retest {(() => { try { return new URL(reports[k].finalUrl).host; } catch { return ''; } })()} ({k})
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {!jobs.length && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Real data only', 'Scores come from Lighthouse and field data from the Chrome UX Report. Missing data is shown as unavailable – never simulated.', ShieldCheck, 'green'],
            ['Actionable diagnostics', 'Every issue lists the exact resource, why it happens, its impact and a priority based on measured or Lighthouse-estimated savings.', Gauge, 'brand'],
            ['Ready-to-use code', 'Generate HTML, CSS, JavaScript, Shopify Liquid and WordPress fixes based on the actual markup found on your page.', Code2, 'pink'],
          ].map(([t, d, Icon, tone]) => (
            <Card key={t} hover className="p-6">
              <IconChip icon={Icon} tone={tone} size={18} className="mb-4 w-fit p-2.5" />
              <p className="font-semibold text-slate-900 dark:text-white">{t}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{d}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
