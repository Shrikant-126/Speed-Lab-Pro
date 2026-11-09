import { Video, Youtube, CheckCircle2 } from 'lucide-react';
import { formatBytes, formatMs, shortUrl } from '@speedlab/shared/format';
import RequireReport from '../components/RequireReport.jsx';
import IssueCard from '../components/IssueCard.jsx';
import { Card, CardHeader, PageHeader, Stat, Badge, PriorityBadge, Notice, EmptyState } from '../components/ui.jsx';

const LABELS = {
  'missing-poster': 'No poster',
  'autoplay-unmuted': 'Autoplay unmuted',
  'missing-playsinline': 'No playsinline',
  'loaded-offscreen': 'Loads offscreen',
  'preload-offscreen': 'Preload offscreen',
  'preload-auto': 'preload=auto',
  'large-file': 'Large file',
  'mobile-download': 'Mobile download',
  'hidden-download': 'Hidden but downloading',
  'single-format': 'Single format',
  'affects-lcp': 'LCP element',
};

function Flag({ on, label }) {
  return <Badge tone={on ? 'brand' : 'slate'}>{label}: {on ? 'yes' : 'no'}</Badge>;
}

function VideosPage({ report }) {
  const v = report.videos || { videos: [], embeds: [], mediaRequests: [] };
  const videos = v.videos || [];
  const embeds = v.embeds || [];
  const media = v.mediaRequests || [];
  const issues = (report.issues || []).filter((i) => i.category === 'video');
  const totalBytes = media.reduce((s, m) => s + (m.bytes || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={Video} title="Video Optimizer" description="HTML videos, background videos, autoplay, posters, preload settings and mobile downloads." />
      {!v.inspected && <Notice tone="warn">Browser inspection was not available, so &lt;video&gt; element attributes could not be read. Only media requests seen by Lighthouse are listed.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Video elements" value={v.inspected ? videos.length : 'Unavailable'} />
        <Stat label="Video embeds" value={v.inspected ? embeds.length : 'Unavailable'} />
        <Stat label="Media requests" value={media.length} />
        <Stat label="Media downloaded" value={formatBytes(totalBytes)} hint="During page load" />
      </div>

      {videos.length === 0 && embeds.length === 0 && media.length === 0 ? (
        <EmptyState icon={Video} title="No videos detected" description="No <video> elements, video embeds or media downloads were found on this page." />
      ) : null}

      {videos.length > 0 && (
        <Card>
          <CardHeader title="Video elements" subtitle={`${videos.length} found`} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {videos.map((vid, idx) => (
              <div key={`${vid.selector}-${idx}`} className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium text-slate-900 dark:text-white">{vid.src ? shortUrl(vid.src, 90) : 'No source set (sources may be attached later)'}</p>
                    <p className="text-xs text-slate-500">{vid.selector}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {vid.isLcp && <Badge tone="red">LCP</Badge>}
                    {vid.isBackground && <Badge tone="violet">Background</Badge>}
                    {vid.priority && <PriorityBadge priority={vid.priority} />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Flag on={vid.autoplay} label="autoplay" />
                  <Flag on={vid.muted} label="muted" />
                  <Flag on={vid.loop} label="loop" />
                  <Flag on={vid.playsinline} label="playsinline" />
                  <Flag on={vid.controls} label="controls" />
                  <Badge>preload: {vid.preload || 'default'}</Badge>
                  <Badge>poster: {vid.poster ? 'yes' : 'no'}</Badge>
                  <Badge>above fold: {vid.aboveFold === null ? 'unknown' : vid.aboveFold ? 'yes' : 'no'}</Badge>
                  {vid.hidden && <Badge tone="amber">hidden</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <span>Downloaded: <b>{vid.bytes ? formatBytes(vid.bytes) : '0 B'}</b></span>
                  <span>Formats: <b>{vid.formats?.length ? vid.formats.join(', ') : 'Unavailable'}</b></span>
                  <span>Rendered: <b>{vid.rendered?.w ? `${vid.rendered.w}×${vid.rendered.h}px` : 'Unavailable'}</b></span>
                </div>
                {vid.issues.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {vid.issues.map((c) => <Badge key={c} tone="amber">{LABELS[c] || c}</Badge>)}
                  </div>
                ) : (
                  <p className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 size={14} /> No problems detected</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {embeds.length > 0 && (
        <Card>
          <CardHeader icon={Youtube} title="Video embeds (iframes)" subtitle="Consider lightweight facades that load the player on click" />
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead><tr><th>Source</th><th>loading</th><th>Above fold</th></tr></thead>
              <tbody>
                {embeds.map((e, i) => (
                  <tr key={`${e.src}-${i}`}>
                    <td className="max-w-[480px] break-all">{shortUrl(e.src, 90)}</td>
                    <td>{e.loading || <Badge tone="amber">not set</Badge>}</td>
                    <td>{e.aboveFold === null ? '—' : e.aboveFold ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {media.length > 0 && (
        <Card>
          <CardHeader title="Media requests during load" />
          <div className="overflow-x-auto p-2">
            <table className="table">
              <thead><tr><th>URL</th><th>Size</th><th>Start</th></tr></thead>
              <tbody>
                {media.map((m, i) => (
                  <tr key={`${m.url}-${i}`}>
                    <td className="max-w-[520px] break-all">{shortUrl(m.url, 100)}</td>
                    <td className="tabular-nums">{formatBytes(m.bytes)}</td>
                    <td className="tabular-nums">{formatMs(m.startMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Video recommendations ({issues.length})</h2>
        {issues.length ? issues.map((i) => <IssueCard key={i.id} issue={i} report={report} />) : <EmptyState title="No video issues found" />}
      </div>
    </div>
  );
}

export default function VideoOptimizer() {
  return <RequireReport title="Video Optimizer">{(report) => <VideosPage report={report} />}</RequireReport>;
}
