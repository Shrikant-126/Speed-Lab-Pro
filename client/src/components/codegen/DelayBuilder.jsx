import { useMemo, useState } from 'react';
import { Timer, Plus, Trash2, MapPin, AlertTriangle } from 'lucide-react';
import { buildDelayCode, DELAY_SCRIPTS, TRIGGERS } from '@speedlab/shared/codegen';
import { Card, CardHeader, Button, Tabs, Notice, Badge } from '../ui.jsx';
import CodeBlock from '../CodeBlock.jsx';

/** Prefill IDs found by the SEO/analytics scan (GTM, GA4, Ads, Pixel, Clarity, Hotjar). */
function detectedItems(report) {
  const a = report?.seo?.analytics;
  if (!a) return [];
  return [
    ...a.gtm.map((id) => ({ key: 'gtm', id })),
    ...(a.gtm.length ? [] : a.ga4.map((id) => ({ key: 'ga4', id }))),
    ...a.ads.map((id) => ({ key: 'gads', id })),
    ...a.fbPixel.map((id) => ({ key: 'metapixel', id })),
    ...a.clarity.map((id) => ({ key: 'clarity', id })),
    ...a.hotjar.map((id) => ({ key: 'hotjar', id })),
  ];
}

export default function DelayBuilder({ report }) {
  const detected = useMemo(() => detectedItems(report), [report]);
  const [items, setItems] = useState(() => (detected.length ? detected : [{ key: 'gtm', id: '' }]).map((i, n) => ({ ...i, uid: n, trigger: DELAY_SCRIPTS.find((d) => d.key === i.key).defaultTrigger, selector: DELAY_SCRIPTS.find((d) => d.key === i.key).selectorDefault || '' })));
  const [fallbackMs, setFallbackMs] = useState(5000);
  const [consentMode, setConsentMode] = useState(!!report?.seo && !report.seo.analytics?.consentDefault && (detected.length > 0));
  const [target, setTarget] = useState(report?.platform?.name === 'wordpress' ? 'wordpress' : report?.platform?.name === 'shopify' ? 'shopify' : 'html');

  const update = (uid, patch) => setItems((list) => list.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  const add = (key) => {
    const d = DELAY_SCRIPTS.find((x) => x.key === key);
    setItems((list) => [...list, { uid: Date.now(), key, id: '', trigger: d.defaultTrigger, selector: d.selectorDefault || '' }]);
  };
  const invalid = items.filter((i) => i.id && !DELAY_SCRIPTS.find((d) => d.key === i.key).pattern.test(i.id.trim()));
  const out = useMemo(() => buildDelayCode(items, { fallbackMs, consentMode }), [items, fallbackMs, consentMode]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={Timer} title="Delay / lazy-load third-party scripts" subtitle="Choose the scripts, enter your IDs and when each should load. Code, placement and required markup are generated below." />
        <div className="space-y-4 p-5">
          {detected.length > 0 && <Notice>Pre-filled from the scan: {detected.map((d) => d.id).join(', ')}.</Notice>}
          {items.map((it) => {
            const def = DELAY_SCRIPTS.find((d) => d.key === it.key);
            const bad = it.id && !def.pattern.test(it.id.trim());
            return (
              <div key={it.uid} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.2fr_1.4fr_1.2fr_1fr_auto] dark:border-white/10">
                <div>
                  <span className="label">Script</span>
                  <select className="input" value={it.key} onChange={(e) => { const d = DELAY_SCRIPTS.find((x) => x.key === e.target.value); update(it.uid, { key: d.key, trigger: d.defaultTrigger, selector: d.selectorDefault || '', id: '' }); }}>
                    {DELAY_SCRIPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <span className="label">{def.idLabel}</span>
                  <input className={`input ${bad ? 'border-red-400' : ''}`} placeholder={def.placeholder} value={it.id} onChange={(e) => update(it.uid, { id: e.target.value })} />
                  {bad && <p className="mt-1 text-xs text-red-500">Looks invalid – expected like {def.placeholder}</p>}
                </div>
                <div>
                  <span className="label">Load when</span>
                  <select className="input" value={it.trigger} onChange={(e) => update(it.uid, { trigger: e.target.value })} disabled={['youtube', 'maps'].includes(it.key)}>
                    {Object.entries(TRIGGERS).filter(([k]) => (k === 'click' ? it.key === 'youtube' : k === 'focus' ? it.key.startsWith('recaptcha') || it.key === 'custom' : true)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <span className="label">{def.selectorLabel || 'Element selector'}</span>
                  <input className="input" placeholder={def.selectorDefault || 'not needed'} value={it.selector} onChange={(e) => update(it.uid, { selector: e.target.value })} disabled={!['focus', 'visible'].includes(it.trigger) && it.key !== 'maps'} />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" icon={Trash2} onClick={() => setItems((l) => l.filter((x) => x.uid !== it.uid))} aria-label="Remove script" />
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value="" onChange={(e) => e.target.value && add(e.target.value)}>
              <option value="">+ Add script…</option>
              {DELAY_SCRIPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              Fallback timeout
              <input type="number" min="0" step="500" className="input w-28" value={fallbackMs} onChange={(e) => setFallbackMs(Math.max(0, Number(e.target.value) || 0))} /> ms
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={consentMode} onChange={(e) => setConsentMode(e.target.checked)} />
              Add Consent Mode v2 defaults
            </label>
          </div>
          {invalid.length > 0 && <Notice tone="warn">Fix the highlighted IDs – the generated code uses exactly what you type.</Notice>}
        </div>
      </Card>

      <Card>
        <CardHeader icon={MapPin} title="Where to add the code" />
        <div className="space-y-4 p-5">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {out.placement.map((p) => <li key={p}>{p}</li>)}
          </ol>
          {out.remove.length > 0 && (
            <div>
              <p className="label">Remove (so scripts are not loaded twice)</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">{out.remove.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {out.markup.map((m) => (
            <div key={m.where} className="space-y-1.5">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200"><Badge tone="violet">Required markup</Badge> {m.where}</p>
              <CodeBlock code={m.code} language="html" maxHeight={220} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Generated code" actions={<Tabs tabs={[{ key: 'html', label: 'HTML (footer)' }, { key: 'wordpress', label: 'WordPress (functions.php)' }, { key: 'shopify', label: 'Shopify (theme.liquid)' }]} value={target} onChange={setTarget} />} />
        <div className="space-y-4 p-5">
          {target === 'html' && (
            <>
              {out.head && <CodeBlock code={out.head} language="html" title="1. Top of <head>" filename="speedlab-head.html" />}
              <CodeBlock code={out.script} language="html" title={`${out.head ? '2' : '1'}. Just before </body>`} filename="speedlab-delay.html" maxHeight={480} tone="after" />
            </>
          )}
          {target === 'wordpress' && <CodeBlock code={out.php} language="php" title="functions.php (child theme) or Code Snippets plugin" filename="speedlab-delay.php" maxHeight={480} tone="after" />}
          {target === 'shopify' && (
            <>
              {out.head && <CodeBlock code={out.head} language="liquid" title="layout/theme.liquid – top of <head>" />}
              <CodeBlock code={out.liquid} language="liquid" title="layout/theme.liquid – just before </body>" filename="speedlab-delay.liquid" maxHeight={480} tone="after" />
            </>
          )}
          {out.notes.length > 0 && (
            <div className="space-y-2">
              <p className="label flex items-center gap-1"><AlertTriangle size={12} /> Consequences – read before going live</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">{out.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
          <Button variant="secondary" icon={Plus} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Edit scripts</Button>
        </div>
      </Card>
    </div>
  );
}
