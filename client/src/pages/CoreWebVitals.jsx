import { Activity, FlaskConical, Users } from 'lucide-react';
import { METRICS, METRIC_ORDER, rateMetric } from '@speedlab/shared/thresholds';
import { formatMetric } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import MetricCard from '../components/MetricCard.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, RatingBadge, Notice, Badge, SourceTag } from '../components/ui.jsx';

function Distribution({ d }) {
  if (!d) return <span className="text-xs text-slate-400">Distribution unavailable</span>;
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <div className="bg-[#0cce6b]" style={{ width: pct(d.good) }} title={`Good ${pct(d.good)}`} />
        <div className="bg-[#ffa400]" style={{ width: pct(d.ni) }} title={`Needs improvement ${pct(d.ni)}`} />
        <div className="bg-[#ff4e42]" style={{ width: pct(d.poor) }} title={`Poor ${pct(d.poor)}`} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{pct(d.good)} good</span>
        <span>{pct(d.ni)}</span>
        <span>{pct(d.poor)} poor</span>
      </div>
    </div>
  );
}

const ISSUE_FOR = { lcp: ['lcp', 'images'], fcp: ['css', 'fonts'], ttfb: ['server'], cls: ['cls'], inp: ['javascript', 'third-party'], tbt: ['javascript', 'third-party'], si: ['images', 'css'] };

export default function CoreWebVitals() {
  return (
    <RequireReport title="Core Web Vitals">
      {(report) => {
        const field = report.field;
        return (
          <div className="space-y-6">
            <PageHeader icon={Activity} title="Core Web Vitals" description="Lab data comes from one simulated Lighthouse page load; field data is the 75th percentile of real Chrome users over the last 28 days (CrUX). They often differ – Google uses field data for ranking." />

            <Card>
              <CardHeader icon={Users} title="Field data (real users)" subtitle={field ? `Source: ${field.source === 'crux-api' ? 'Chrome UX Report API' : 'PageSpeed Insights (CrUX)'} · ${field.scope === 'origin' ? 'origin-level (whole site) – not enough data for this exact URL' : 'URL-level'}${field.collectionPeriod ? ` · ${field.collectionPeriod.start} → ${field.collectionPeriod.end}` : ''}` : 'Unavailable'} actions={<SourceTag kind={field ? 'field' : 'unavailable'} />} />
              {field ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
                  {['lcp', 'inp', 'cls', 'fcp', 'ttfb'].map((k) => {
                    const m = field.metrics[k];
                    return (
                      <div key={k} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase text-slate-500">{METRICS[k].short}{METRICS[k].coreWebVital && <span className="ml-1 text-brand-500">★</span>}</span>
                          <RatingBadge rating={m?.rating || 'unavailable'} />
                        </div>
                        <p className="mt-2 text-2xl font-bold tabular-nums">{formatMetric(k, m?.p75 ?? null)}</p>
                        <p className="mb-3 text-xs text-slate-500">p75</p>
                        <Distribution d={m?.distribution} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-5">
                  <Notice>
                    The Chrome UX Report has no field data for this URL or origin (not enough real-user traffic), or no CrUX API key is configured. Field metrics – including INP – are shown as unavailable rather than estimated.
                  </Notice>
                </div>
              )}
              {field && (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">
                  ★ Core Web Vitals used for the “passes assessment” decision: LCP, INP and CLS. Assessment: {['lcp', 'inp', 'cls'].every((k) => field.metrics[k]?.rating === 'good') ? <Badge tone="green">Passed</Badge> : ['lcp', 'inp', 'cls'].some((k) => field.metrics[k]?.rating === 'unavailable') ? <Badge>Incomplete data</Badge> : <Badge tone="red">Failed</Badge>}
                </p>
              )}
            </Card>

            <div>
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <FlaskConical size={18} /> Lab data (Lighthouse, {report.strategy}{report.sources.throttling ? `, ${report.sources.throttling} throttling` : ''})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {METRIC_ORDER.map((k) =>
                  k === 'inp' ? (
                    <MetricCard key={k} metric="inp" value={null} note="INP requires real user interactions and cannot be measured in a lab page load. Use TBT as the lab proxy." />
                  ) : (
                    <MetricCard key={k} metric={k} value={report.lab[k]?.value ?? null} note={report.lab[k]?.note} source={report.lab.source === 'playwright-unthrottled' ? 'measured' : 'lab'} />
                  ),
                )}
              </div>
            </div>

            <Card>
              <CardHeader title="Metric reference, thresholds & recommendations" />
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Lab</th>
                      <th>Field p75</th>
                      <th>Good</th>
                      <th>Poor</th>
                      <th className="min-w-[320px]">What it means & how to improve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ORDER.map((k) => {
                      const m = METRICS[k];
                      const lab = report.lab[k]?.value ?? null;
                      const f = field?.metrics?.[k]?.p75 ?? null;
                      return (
                        <tr key={k}>
                          <td className="font-semibold">{m.short}<p className="text-xs font-normal text-slate-500">{m.label}</p></td>
                          <td className="whitespace-nowrap tabular-nums">{formatMetric(k, lab)} <div><RatingBadge rating={rateMetric(k, lab)} /></div></td>
                          <td className="whitespace-nowrap tabular-nums">{m.labOnly ? <span className="text-xs text-slate-400">lab-only metric</span> : <>{formatMetric(k, f)} <div><RatingBadge rating={rateMetric(k, f)} /></div></>}</td>
                          <td className="whitespace-nowrap">≤ {formatMetric(k, m.good)}</td>
                          <td className="whitespace-nowrap">&gt; {formatMetric(k, m.poor)}</td>
                          <td>
                            <p className="text-slate-600 dark:text-slate-300">{m.description}</p>
                            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
                              {m.advice.map((a) => (
                                <li key={a}>{a}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {['lcp', 'cls', 'tbt', 'ttfb'].map((k) => {
              const rating = rateMetric(k, report.lab[k]?.value);
              if (rating === 'good' || rating === 'unavailable') return null;
              const related = report.issues.filter((i) => ISSUE_FOR[k].includes(i.category)).slice(0, 4);
              if (!related.length) return null;
              return (
                <div key={k}>
                  <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Improve {METRICS[k].short} ({formatMetric(k, report.lab[k].value)})</h2>
                  <div className="space-y-3">
                    {related.map((i) => (
                      <IssueCard key={i.id} issue={i} report={report} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }}
    </RequireReport>
  );
}
