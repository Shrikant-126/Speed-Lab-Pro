import { Fragment, useState } from 'react';
import { Puzzle, ChevronDown } from 'lucide-react';
import { formatBytes, formatMs } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, Stat, Badge, EmptyState, Notice, cx } from '../components/ui.jsx';

const DELAY_TONE = { yes: 'green', conditional: 'blue', partial: 'amber', no: 'red', review: 'slate' };
const DELAY_LABEL = { yes: 'Delayable', conditional: 'Conditional', partial: 'Partially', no: 'Essential', review: 'Review' };

function Content({ report }) {
  const tp = report.thirdParty || { entities: [], totals: {} };
  const [open, setOpen] = useState(null);
  const issues = (report.issues || []).filter((i) => i.category === 'third-party');
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Third-party providers" value={tp.totals?.count ?? tp.entities.length} />
        <Stat label="Transfer size" value={formatBytes(tp.totals?.bytes)} />
        <Stat label="Main-thread time" value={tp.totals?.mainThreadMs ? formatMs(tp.totals.mainThreadMs) : 'Unavailable'} hint="From Lighthouse when available" />
      </div>
      <Notice>
        Delaying tags improves loading but can affect analytics, attribution or features. Each row lists the consequence — review it with the tag owner before removing or delaying anything.
      </Notice>
      <Card>
        <CardHeader icon={Puzzle} title="Third-party scripts & services" subtitle="Sorted by main-thread impact" />
        <div className="overflow-x-auto">
          {!tp.entities.length ? (
            <div className="p-5"><EmptyState title="No third-party resources detected" className="py-6" /></div>
          ) : (
            <table className="table min-w-[900px]">
              <thead>
                <tr>
                  <th />
                  <th>Provider</th>
                  <th>Category</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Main thread</th>
                  <th className="text-right">Blocking</th>
                  <th>Loading</th>
                  <th>Action</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {tp.entities.map((e, i) => (
                  <Fragment key={`${e.name}-${i}`}>
                    <tr className="cursor-pointer" onClick={() => setOpen(open === i ? null : i)}>
                      <td><ChevronDown size={15} className={cx('text-slate-400 transition', open === i && 'rotate-180')} /></td>
                      <td>
                        <p className="font-medium text-slate-900 dark:text-white">{e.product || e.name}</p>
                        {e.product && e.product !== e.name && <p className="text-xs text-slate-500">{e.name}</p>}
                      </td>
                      <td className="capitalize">{e.category.replace('-', ' ')}</td>
                      <td className="text-right tabular-nums">{formatBytes(e.transferSize)}</td>
                      <td className="text-right tabular-nums">{e.mainThreadMs == null ? '—' : formatMs(e.mainThreadMs)}</td>
                      <td className="text-right tabular-nums">{e.blockingMs == null ? '—' : formatMs(e.blockingMs)}</td>
                      <td><Badge tone={e.loading === 'blocking' ? 'red' : e.loading === 'unknown' ? 'slate' : 'green'}>{e.loading}</Badge></td>
                      <td><Badge tone={DELAY_TONE[e.delayable]}>{DELAY_LABEL[e.delayable] || e.delayable}</Badge></td>
                      <td className="max-w-xs text-xs text-slate-600 dark:text-slate-300">{e.recommendation}</td>
                    </tr>
                    {open === i && (
                      <tr>
                        <td />
                        <td colSpan={8} className="bg-slate-50 dark:bg-slate-950/50">
                          <p className="label">Consequence of delaying / removing</p>
                          <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">{e.consequence}</p>
                          <p className="label">Requests ({e.urls.length})</p>
                          <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                            {e.urls.length ? e.urls.map((u) => <li key={u} className="break-all text-slate-600 dark:text-slate-400">{u}</li>) : <li className="text-slate-500">No URLs reported</li>}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Third-party issues ({issues.length})</h2>
        {issues.length ? issues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No third-party issues detected" className="py-8" />}
      </div>
    </div>
  );
}

export default function ThirdParty() {
  return (
    <div>
      <PageHeader icon={Puzzle} title="Third-Party Scripts" description="Analytics, tag managers, pixels, chat widgets, reviews and app scripts — with their cost and safe loading strategies." />
      <RequireReport title="third-party analysis">{(report) => <Content report={report} />}</RequireReport>
    </div>
  );
}
