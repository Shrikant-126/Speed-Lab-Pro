import { useMemo } from 'react';
import { Server, CheckCircle2, XCircle, ExternalLink, Info } from 'lucide-react';
import { detectHosting } from '@speedlab/shared/codegen';
import { Card, CardHeader, Badge, Notice, EmptyState, KeyValue } from '../ui.jsx';

export default function HostingPlugins({ report }) {
  const h = useMemo(() => (report ? detectHosting(report) : null), [report]);
  if (!report) {
    return <EmptyState icon={Server} title="Scan a website first" description="Hosting is detected from the server response headers of a scan." />;
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={Server}
          title={`Detected hosting: ${h.name}`}
          subtitle={h.caching}
          actions={h.docs && (
            <a href={h.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Host’s plugin policy <ExternalLink size={13} />
            </a>
          )}
        />
        <div className="space-y-4 p-5">
          <KeyValue
            items={[
              ['Platform', report.platform?.label || 'Unknown'],
              ['Cache / optimisation plugin in use', h.cachePlugin || 'None detected'],
              ['CDN', h.cdn?.length ? h.cdn.join(', ') : 'None detected'],
              ['Cache status (HTML)', h.cacheStatus || '—'],
              h.alsoDetected?.length ? ['Also detected', h.alsoDetected.join(', ')] : null,
            ]}
          />
          {h.evidence?.length > 0 && <p className="text-xs text-slate-500">Evidence: {h.evidence.join(' · ')}</p>}
          {h.key === 'unknown' && <Notice>The host could not be identified from the headers (many hosts hide them). The generic recommendations for your server type below still apply; ask your host whether they block caching plugins.</Notice>}
          {report.platform?.name && !['wordpress', 'shopify'].includes(report.platform.name) && (
            <Notice>This site does not look like WordPress or Shopify, so plugin recommendations are for reference only.</Notice>
          )}
        </div>
      </Card>

      {h.recommended?.length > 0 && (
        <Card>
          <CardHeader icon={CheckCircle2} title={h.platform === 'shopify' ? 'Recommended approach' : 'Compatible / recommended plugins'} subtitle="Use one optimisation plugin – stacking several causes conflicts" />
          <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {h.recommended.map((p) => (
              <div key={p.name} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 size={17} className="text-emerald-500" />
                  <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                  {h.cachePlugin && p.name.includes(h.cachePlugin) && <Badge tone="green">Already installed</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{p.why}</p>
                {p.settings && <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-white/[0.03] dark:text-slate-400"><b>Settings:</b> {p.settings}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {h.avoid?.length > 0 && (
        <Card>
          <CardHeader icon={XCircle} title="Avoid on this hosting" subtitle="Not supported, banned by the host, or redundant" />
          <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {h.avoid.map((p) => (
              <div key={p.name} className="flex gap-3 p-5">
                <XCircle size={17} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{p.why}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><Info size={13} /> Hosting policies change. Confirm on the host’s own page before installing.</p>
    </div>
  );
}
