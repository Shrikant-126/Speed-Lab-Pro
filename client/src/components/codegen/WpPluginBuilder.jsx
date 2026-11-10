import { useMemo, useState } from 'react';
import { Puzzle, Download, AlertTriangle, CheckSquare } from 'lucide-react';
import { buildWpPlugin, WP_FEATURES, WP_DEFAULT_SETTINGS } from '@speedlab/shared/codegen';
import { Card, CardHeader, Button, Notice, Badge } from '../ui.jsx';
import CodeBlock from '../CodeBlock.jsx';
import { downloadBlob } from '../../lib/api.js';

const lines = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

/** Suggest feature defaults and settings from the scan evidence. */
function fromReport(report) {
  const types = new Set((report?.issues || []).map((i) => i.type));
  const sel = new Set(WP_FEATURES.filter((f) => f.default).map((f) => f.key));
  if (types.has('img-lazy-missing')) sel.add('lazy_images');
  if (types.has('js-render-blocking') || types.has('js-unused')) sel.add('defer_js');
  if (types.has('third-party-delay')) sel.add('delay_js');
  if (types.has('font-preload')) sel.add('preload_fonts');
  if (types.has('preconnect')) sel.add('resource_hints');
  if (report?.lcp?.imageUrl) sel.add('lcp_priority');
  if (report?.platform?.woocommerce) sel.add('woo_cart_fragments');
  const settings = { ...WP_DEFAULT_SETTINGS };
  if (report?.lcp?.imageUrl) settings.lcpUrl = report.lcp.imageUrl;
  const fonts = (report?.css?.fonts || []).filter((f) => !f.thirdParty && /woff2/.test(f.url)).slice(0, 2).map((f) => f.url);
  if (fonts.length) settings.preloadFonts = fonts;
  const pre = (report?.issues || []).find((i) => i.type === 'preconnect')?.evidence?.origins;
  if (pre?.length) settings.preconnect = pre;
  return { sel, settings };
}

export default function WpPluginBuilder({ report }) {
  const initial = useMemo(() => fromReport(report), [report]);
  const [selected, setSelected] = useState(initial.sel);
  const [s, setS] = useState(initial.settings);
  const [preview, setPreview] = useState(false);
  const isWp = report?.platform?.name === 'wordpress';
  const plugin = useMemo(() => buildWpPlugin([...selected], s, { cachePlugin: report?.platform?.cachePlugin, url: report?.finalUrl }), [selected, s, report]);
  const groups = [...new Set(WP_FEATURES.map((f) => f.group))];
  const toggle = (k) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const download = async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const [path, content] of Object.entries(plugin.files)) zip.file(path, content);
    downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${plugin.slug}.zip`);
  };

  return (
    <div className="space-y-5">
      {report && !isWp && <Notice tone="warn">The scanned site is {report.platform?.label || 'not detected as WordPress'}. This plugin only works on WordPress.</Notice>}
      <Card>
        <CardHeader
          icon={Puzzle}
          title="WordPress optimisation plugin builder"
          subtitle="Tick the optimisations you need. Only the selected features are included in the plugin – deactivate it to undo everything."
          actions={<Badge tone="brand">{selected.size} selected</Badge>}
        />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="label">{g}</p>
              <div className="space-y-2">
                {WP_FEATURES.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${selected.has(f.key) ? 'border-brand-400 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10'}`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={selected.has(f.key)} onChange={() => toggle(f.key)} />
                    <span>
                      <span className="block text-sm font-medium text-slate-900 dark:text-white">{f.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{f.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={CheckSquare} title="Settings for the selected features" subtitle={report ? 'Pre-filled from your scan where possible' : 'Fill in the values your site needs'} />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <span className="label">Plugin name</span>
            <input className="input" value={s.pluginName} onChange={(e) => set('pluginName', e.target.value)} maxLength={60} />
          </div>
          {selected.has('lazy_images') && (
            <div>
              <span className="label">Images to keep eager (above the fold)</span>
              <input type="number" min="0" max="10" className="input" value={s.lazySkip} onChange={(e) => set('lazySkip', e.target.value)} />
            </div>
          )}
          {selected.has('lcp_priority') && (
            <div className="md:col-span-2">
              <span className="label">LCP / hero image URL</span>
              <input className="input" placeholder="https://example.com/wp-content/uploads/hero.jpg" value={s.lcpUrl} onChange={(e) => set('lcpUrl', e.target.value)} />
            </div>
          )}
          {selected.has('defer_js') && (
            <div>
              <span className="label">Do not defer these script handles (one per line)</span>
              <textarea className="input h-24 font-mono text-xs" value={s.deferExclude.join('\n')} onChange={(e) => set('deferExclude', lines(e.target.value))} />
            </div>
          )}
          {selected.has('delay_js') && (
            <>
              <div>
                <span className="label">Delay scripts containing (one per line)</span>
                <textarea className="input h-24 font-mono text-xs" value={s.delayPatterns.join('\n')} onChange={(e) => set('delayPatterns', lines(e.target.value))} />
              </div>
              <div>
                <span className="label">Run delayed scripts anyway after (ms)</span>
                <input type="number" min="0" step="500" className="input" value={s.delayTimeout} onChange={(e) => set('delayTimeout', e.target.value)} />
              </div>
            </>
          )}
          {selected.has('async_css') && (
            <div>
              <span className="label">Style handles to load async (one per line)</span>
              <textarea className="input h-24 font-mono text-xs" placeholder={'contact-form-7\nslick-css'} value={s.asyncCss.join('\n')} onChange={(e) => set('asyncCss', lines(e.target.value))} />
              <p className="mt-1 text-xs text-slate-500">Handle = the id of the &lt;link&gt; tag without “-css”.</p>
            </div>
          )}
          {selected.has('preload_fonts') && (
            <div>
              <span className="label">Font URLs to preload (max 2)</span>
              <textarea className="input h-24 font-mono text-xs" value={s.preloadFonts.join('\n')} onChange={(e) => set('preloadFonts', lines(e.target.value).slice(0, 4))} />
            </div>
          )}
          {selected.has('resource_hints') && (
            <div>
              <span className="label">Origins to preconnect (max 4)</span>
              <textarea className="input h-24 font-mono text-xs" value={s.preconnect.join('\n')} onChange={(e) => set('preconnect', lines(e.target.value).filter((u) => /^https:\/\//.test(u)).slice(0, 6))} />
            </div>
          )}
        </div>
      </Card>

      {plugin.warnings.length > 0 && (
        <div className="space-y-2">
          {plugin.warnings.map((w) => <Notice key={w} tone="warn"><AlertTriangle size={14} className="mr-1 inline" />{w}</Notice>)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon={Download} onClick={download} disabled={!selected.size}>Download plugin (.zip)</Button>
        <Button variant="secondary" onClick={() => setPreview((p) => !p)}>{preview ? 'Hide code' : 'Preview code'}</Button>
      </div>
      <Notice>
        Install: WordPress admin → Plugins → Add New → <b>Upload Plugin</b> → choose <code>{plugin.slug}.zip</code> → Activate → clear all caches → test pages, forms and checkout → Retest in SpeedLab. Try it on a staging site first.
      </Notice>
      {preview && Object.entries(plugin.files).map(([path, content]) => (
        <CodeBlock key={path} code={content} language={path.endsWith('.php') ? 'php' : 'text'} title={path} filename={path.split('/').pop()} maxHeight={520} />
      ))}
    </div>
  );
}
