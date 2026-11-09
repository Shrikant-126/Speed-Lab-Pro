import { useState } from 'react';
import { ChevronDown, Bookmark, Check, ExternalLink } from 'lucide-react';
import { formatBytes, formatMs, shortUrl } from '@speedlab/shared/format';
import { PriorityBadge, Badge, SourceTag, Button, cx } from './ui.jsx';
import SnippetViewer from './SnippetViewer.jsx';
import { api } from '../lib/api.js';

export function SavingsText({ savings }) {
  if (!savings) return null;
  const parts = [];
  if (savings.ms) parts.push(`~${formatMs(savings.ms)}`);
  if (savings.bytes) parts.push(`~${formatBytes(savings.bytes)}`);
  if (!parts.length) return null;
  const src = savings.source === 'measured' ? 'measured' : savings.source === 'lighthouse' ? 'lighthouse' : 'estimate';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      Potential saving {parts.join(' / ')} <SourceTag kind={src} />
    </span>
  );
}

export default function IssueCard({ issue, report, defaultOpen = false, showCode = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api('/recommendations', { method: 'POST', body: { issue, scanId: report?.id } });
      setSaved(true);
    } catch {
      /* surfaced by disabled state */
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-4 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={issue.priority} />
            <Badge tone="slate" className="capitalize">{issue.category.replace('-', ' ')}</Badge>
            {issue.metrics?.map((m) => (
              <Badge key={m} tone="violet">{m}</Badge>
            ))}
          </div>
          <p className="mt-2 font-semibold text-slate-900 dark:text-white">{issue.title}</p>
          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">{issue.description}</p>
          <div className="mt-1.5"><SavingsText savings={issue.savings} /></div>
        </div>
        <ChevronDown size={18} className={cx('mt-1 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-5 border-t border-slate-100 px-5 py-5 dark:border-slate-800">
          <div className="grid gap-4 text-sm md:grid-cols-2">
            {issue.resource && (
              <div className="md:col-span-2">
                <p className="label">Affected resource</p>
                {/^https?:/.test(issue.resource) ? (
                  <a href={issue.resource} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 break-all text-brand-600 hover:underline dark:text-brand-400">
                    {shortUrl(issue.resource, 120)} <ExternalLink size={12} className="shrink-0" />
                  </a>
                ) : (
                  <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{issue.resource}</code>
                )}
              </div>
            )}
            <div>
              <p className="label">Why it happens</p>
              <p className="text-slate-700 dark:text-slate-300">{issue.why}</p>
            </div>
            <div>
              <p className="label">Performance impact</p>
              <p className="text-slate-700 dark:text-slate-300">{issue.impact}</p>
            </div>
            <div className="md:col-span-2">
              <p className="label">Recommended solution</p>
              <p className="text-slate-700 dark:text-slate-300">{issue.solution}</p>
            </div>
            {issue.description?.includes('\n') && (
              <div className="md:col-span-2">
                <p className="label">Details</p>
                <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">{issue.description}</pre>
              </div>
            )}
          </div>
          {showCode && (
            <div>
              <p className="label">Generated code (before → after)</p>
              <SnippetViewer issue={issue} report={report} />
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" icon={saved ? Check : Bookmark} loading={saving} disabled={saved} onClick={save}>
              {saved ? 'Saved to recommendations' : 'Save recommendation'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
