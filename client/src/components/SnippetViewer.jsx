// Shows generated fixes for an issue with platform tabs and before/after comparison.

import { useMemo, useState } from 'react';
import { Download, MapPin } from 'lucide-react';
import { generateFixes, availableTargets, contextFromReport, snippetsToText } from '@speedlab/shared/codegen';
import CodeBlock from './CodeBlock.jsx';
import { Tabs, Button, EmptyState } from './ui.jsx';
import { downloadText } from '../lib/api.js';

export function useSnippets(issue, report) {
  return useMemo(() => (issue ? generateFixes(issue, contextFromReport(report)) : []), [issue, report]);
}

export default function SnippetViewer({ issue, report, initialTarget, compact = false }) {
  const snippets = useSnippets(issue, report);
  const targets = availableTargets(snippets);
  const preferred = initialTarget && targets.some((t) => t.key === initialTarget) ? initialTarget : report?.platform?.name === 'shopify' && targets.some((t) => t.key === 'shopify') ? 'shopify' : report?.platform?.name === 'wordpress' && targets.some((t) => t.key === 'wordpress') ? 'wordpress' : targets[0]?.key;
  const [target, setTarget] = useState(preferred);
  const active = targets.some((t) => t.key === target) ? target : targets[0]?.key;

  if (!snippets.length) {
    return <EmptyState title="No code needed" description="This issue is addressed through configuration or content changes described above." className="py-6" />;
  }
  const list = snippets.filter((s) => s.target === active);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs tabs={targets.map((t) => ({ ...t, count: snippets.filter((s) => s.target === t.key).length }))} value={active} onChange={setTarget} />
        <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadText(snippetsToText(issue, snippets), `speedlab-${issue.type}.txt`)}>
          Download all snippets
        </Button>
      </div>
      {list.map((s, i) => (
        <div key={`${s.title}-${i}`} className="space-y-2">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
            {s.placement && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <MapPin size={12} /> {s.placement}
              </p>
            )}
          </div>
          {s.before && !compact ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <CodeBlock code={s.before} language={s.language} tone="before" maxHeight={320} />
              <CodeBlock code={s.after} language={s.language} tone="after" maxHeight={320} />
            </div>
          ) : (
            <CodeBlock code={s.after} language={s.language} tone="after" />
          )}
          {s.notes?.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
              {s.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
