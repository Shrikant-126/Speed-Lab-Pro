import { useMemo, useRef, useState } from 'react';
import { Code2, Download, Upload, FileArchive, ShoppingBag, Globe, CheckCircle2, AlertTriangle, MapPin, Trash2 } from 'lucide-react';
import { generateFixes, contextFromReport, buildFrameworkFixes, JS_FRAMEWORKS, detectFramework } from '@speedlab/shared/codegen';
import { formatBytes } from '@speedlab/shared/format';
import { useApp } from '../context/AppContext.jsx';
import { api, downloadBlob } from '../lib/api.js';
import SnippetViewer from '../components/SnippetViewer.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { PageHeader, Tabs, Card, CardHeader, Select, Button, EmptyState, ErrorState, Notice, PriorityBadge, Badge, Collapsible, Spinner } from '../components/ui.jsx';
import { Link } from 'react-router-dom';
import HostingPlugins from '../components/codegen/HostingPlugins.jsx';
import DelayBuilder from '../components/codegen/DelayBuilder.jsx';
import WpPluginBuilder from '../components/codegen/WpPluginBuilder.jsx';

// ---------------------------------------------------------------- From scan
function FromScan({ report }) {
  const issues = report.issues || [];
  const [issueId, setIssueId] = useState(issues[0]?.id || '');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const issue = issues.find((i) => i.id === issueId) || issues[0];
  if (!issues.length) return <EmptyState title="No issues in this scan" description="Nothing to generate — this page passed all checks." />;
  const downloadAll = async () => {
    setError(null);
    setDownloading(true);
    try {
      const res = await api(`/scans/${report.id}/snippets`, { raw: true });
      downloadBlob(await res.blob(), `speedlab-snippets-${String(report.id).slice(0, 8)}.txt`);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={Code2}
          title="Select an identified issue"
          subtitle={`${issues.length} issues from the ${report.strategy} scan`}
          actions={report.id ? <Button variant="secondary" icon={Download} loading={downloading} onClick={downloadAll}>All snippets for this scan</Button> : null}
        />
        <div className="space-y-3 p-5">
          {error && <ErrorState message={error} />}
          <select className="input" value={issue?.id} onChange={(e) => setIssueId(e.target.value)}>
            {['critical', 'high', 'medium', 'low'].map((p) => {
              const list = issues.filter((i) => i.priority === p);
              if (!list.length) return null;
              return (
                <optgroup key={p} label={`${p[0].toUpperCase()}${p.slice(1)} priority`}>
                  {list.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </optgroup>
              );
            })}
          </select>
          {issue && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950/60">
              <div className="mb-1 flex flex-wrap gap-2"><PriorityBadge priority={issue.priority} /><Badge className="capitalize">{issue.category}</Badge></div>
              <p className="text-slate-700 dark:text-slate-300">{issue.solution}</p>
              {issue.resource && <p className="mt-1 break-all text-xs text-slate-500">{issue.resource}</p>}
            </div>
          )}
        </div>
      </Card>
      {issue && (
        <Card className="p-5">
          <SnippetViewer key={issue.id} issue={issue} report={report} />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Platform optimizer
const SHOPIFY_THEMES = ['Dawn', 'Horizon', 'Prestige', 'Empire', 'Symmetry', 'Other'];
const SHOPIFY_PLACEMENT = {
  Dawn: ['layout/theme.liquid – <head> preloads, script tags, font loading', 'sections/image-banner.liquid and sections/slideshow.liquid – hero images', 'snippets/card-product.liquid – product grid images', 'assets/base.css / component-*.css – stylesheets'],
  Horizon: ['layout/theme.liquid – <head> resources', 'sections/hero.liquid (and similar hero/slideshow sections) – hero images', 'snippets/ product card snippets – collection images', 'Horizon uses theme blocks; check blocks/ for image and video blocks'],
  Prestige: ['layout/theme.liquid – <head>', 'Slideshow / image-with-text sections in sections/ – hero media', 'Product card snippet in snippets/ – grid images'],
  Empire: ['layout/theme.liquid – <head>', 'Slideshow / hero sections in sections/', 'Product grid item snippet in snippets/'],
  Symmetry: ['layout/theme.liquid – <head>', 'Slideshow / image banner sections in sections/', 'Product block snippet in snippets/'],
  Other: ['layout/theme.liquid – <head> resources and scripts', 'The first section on your home page template (templates/index.json) – hero media', 'Product card snippet – collection grid images'],
};

function PlatformOptimizer({ report }) {
  const detected = report?.platform || {};
  const [platform, setPlatform] = useState(detected.name === 'wordpress' ? 'wordpress' : detected.name === 'shopify' ? 'shopify' : detected.name === 'other' ? 'javascript' : 'shopify');
  const [framework, setFramework] = useState(() => detectFramework(report));
  const detectedTheme = SHOPIFY_THEMES.find((t) => (detected.knownTheme || detected.theme || '').toLowerCase().includes(t.toLowerCase()));
  const [theme, setTheme] = useState(detectedTheme || 'Dawn');
  const [builder, setBuilder] = useState(['Elementor', 'Divi', 'Bricks', 'Gutenberg'].includes(detected.builder) ? detected.builder : 'Elementor');
  const [cachePlugin, setCachePlugin] = useState(['WP Rocket', 'LiteSpeed Cache'].includes(detected.cachePlugin) ? detected.cachePlugin : 'None');

  const groups = useMemo(() => {
    if (!report) return [];
    if (platform === 'javascript') return buildFrameworkFixes(report, framework);
    const ctx = {
      ...contextFromReport(report),
      platform: { name: platform, label: platform === 'shopify' ? 'Shopify' : 'WordPress', theme, builder, cachePlugin: cachePlugin === 'None' ? null : cachePlugin },
    };
    return (report.issues || [])
      .map((issue) => ({ issue, snippets: generateFixes(issue, ctx).filter((s) => s.target === platform) }))
      .filter((g) => g.snippets.length);
  }, [report, platform, theme, builder, cachePlugin, framework]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={platform === 'shopify' ? ShoppingBag : Globe} title="Platform optimizer" subtitle={detected.name ? `Detected: ${detected.label}${detected.theme ? ` · theme ${detected.theme}` : ''}${detected.builder ? ` · ${detected.builder}` : ''}${detected.cachePlugin ? ` · ${detected.cachePlugin}` : ''}` : 'No platform detected – choose one'} />
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div>
            <label className="label">Platform</label>
            <Tabs tabs={[{ key: 'shopify', label: 'Shopify' }, { key: 'wordpress', label: 'WordPress' }, { key: 'javascript', label: 'JavaScript' }]} value={platform} onChange={setPlatform} />
          </div>
          {platform === 'javascript' ? (
            <div>
              <label className="label">Framework</label>
              <Select value={framework} onChange={setFramework} options={JS_FRAMEWORKS.map((f) => ({ value: f.key, label: f.label }))} />
            </div>
          ) : platform === 'shopify' ? (
            <div>
              <label className="label">Theme</label>
              <Select value={theme} onChange={setTheme} options={SHOPIFY_THEMES.map((t) => ({ value: t, label: t }))} />
            </div>
          ) : (
            <>
              <div>
                <label className="label">Builder</label>
                <Select value={builder} onChange={setBuilder} options={['Elementor', 'Divi', 'Bricks', 'Gutenberg'].map((t) => ({ value: t, label: t }))} />
              </div>
              <div>
                <label className="label">Cache plugin</label>
                <Select value={cachePlugin} onChange={setCachePlugin} options={['WP Rocket', 'LiteSpeed Cache', 'None'].map((t) => ({ value: t, label: t }))} />
              </div>
            </>
          )}
        </div>
        {platform === 'shopify' && (
          <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <p className="label">Typical file placement ({theme})</p>
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {SHOPIFY_PLACEMENT[theme].map((p) => <li key={p} className="flex gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-brand-500" />{p}</li>)}
            </ul>
            <p className="mt-2 text-xs text-slate-500">File names vary between theme versions; search your theme code for the markup shown in the “before” snippets. Always edit a duplicate theme first.</p>
          </div>
        )}
        {platform === 'javascript' && (
          <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            Framework-specific fixes for the issues in this scan ({JS_FRAMEWORKS.find((f) => f.key === framework).label}). Each snippet shows the file to edit; React examples work with Vite or CRA, Next.js examples use the App Router.
          </div>
        )}
        {platform === 'wordpress' && (
          <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            Put PHP snippets in a child theme&apos;s <code>functions.php</code> or a code-snippets plugin, never in the parent theme. Settings notes below are tailored to {builder}{cachePlugin !== 'None' ? ` + ${cachePlugin}` : ''}.
          </div>
        )}
      </Card>
      {!report ? (
        <EmptyState title="Run a scan first" description="Platform-specific code is generated from the issues found on your site." action={<Link to="/analyzer"><Button>Analyze a website</Button></Link>} />
      ) : !groups.length ? (
        <EmptyState title={`No ${platform === 'shopify' ? 'Shopify' : platform === 'javascript' ? 'JavaScript' : 'WordPress'} snippets for this scan`} description="None of the detected issues have platform-specific fixes." />
      ) : (
        <div className="space-y-3">
          {groups.map(({ issue, snippets }) => (
            <Collapsible key={issue.id} title={<span className="flex flex-wrap items-center gap-2"><PriorityBadge priority={issue.priority} /> {issue.title}</span>}>
              <div className="space-y-4">
                {snippets.map((s, i) => (
                  <div key={i} className="space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
                    {s.placement && <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{s.placement}</p>}
                    {s.before ? (
                      <div className="grid gap-3 xl:grid-cols-2">
                        <CodeBlock code={s.before} language={s.language} tone="before" maxHeight={300} />
                        <CodeBlock code={s.after} language={s.language} tone="after" maxHeight={300} />
                      </div>
                    ) : (
                      <CodeBlock code={s.after} language={s.language} tone="after" />
                    )}
                    {s.notes?.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                  </div>
                ))}
              </div>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Upload
const RISK_TONE = { low: 'green', medium: 'amber', high: 'red' };

function buildForm(files, extra = {}) {
  const form = new FormData();
  const paths = [];
  for (const f of files) {
    form.append('files', f, f.name);
    paths.push(f.webkitRelativePath || f.name);
  }
  form.append('paths', JSON.stringify(paths));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

function UploadProject() {
  const [files, setFiles] = useState([]);
  const [folderMode, setFolderMode] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const pick = (list) => {
    setFiles([...list]);
    setAnalysis(null);
    setResult(null);
    setApproved(false);
    setError(null);
  };
  const analyze = async () => {
    setBusy('analyze');
    setError(null);
    setResult(null);
    try {
      const a = await api('/uploads/analyze', { method: 'POST', form: buildForm(files) });
      setAnalysis(a);
      setSelected(new Set(a.changes.filter((c) => c.selected).map((c) => c.id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await api('/uploads/apply', { method: 'POST', raw: true, form: buildForm(files, { approved: JSON.stringify([...selected]), confirm: 'yes' }) });
      const blob = await res.blob();
      downloadBlob(blob, 'speedlab-optimized-project.zip');
      setResult({ applied: Number(res.headers.get('x-applied-count') || 0), failed: Number(res.headers.get('x-failed-count') || 0), size: blob.size });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-5">
      <Notice>
        Uploaded files are analysed as text only — nothing is executed. Your originals are never modified: the download contains an <code>original/</code> backup, an <code>optimized/</code> copy and a <code>CHANGES.md</code> summary. Changes are applied only after you approve them.
      </Notice>
      <Card>
        <CardHeader icon={Upload} title="Upload source project" subtitle="A .zip archive, multiple files, or a whole folder (HTML, Liquid, PHP, CSS, JS, images)" />
        <div className="space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={folderMode} onChange={(e) => setFolderMode(e.target.checked)} /> Select a folder instead of files
          </label>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-brand-400 dark:border-slate-700"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) pick(e.dataTransfer.files);
            }}
          >
            <FileArchive size={28} className="mb-2 text-slate-400" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Drop files here or click to browse</p>
            <p className="mt-1 text-xs text-slate-500">Max 25 MB locally (4 MB on Vercel). node_modules and unsupported files are skipped.</p>
            <input
              ref={inputRef}
              key={folderMode ? 'dir' : 'files'}
              type="file"
              multiple
              className="hidden"
              {...(folderMode ? { webkitdirectory: '', directory: '' } : { accept: '.zip,.html,.htm,.liquid,.php,.twig,.css,.scss,.js,.mjs,.jpg,.jpeg,.png,.gif,.webp,.svg,.json' })}
              onChange={(e) => pick(e.target.files)}
            />
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">{files.length} file(s) · {formatBytes(totalBytes)}</p>
              <div className="flex gap-2">
                <Button variant="ghost" icon={Trash2} onClick={() => pick([])}>Clear</Button>
                <Button icon={Code2} loading={busy === 'analyze'} onClick={analyze}>Analyze files</Button>
              </div>
            </div>
          )}
          {error && <ErrorState message={error} />}
        </div>
      </Card>

      {busy === 'analyze' && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Analysing files…</div>}

      {analysis && (
        <>
          <Card>
            <CardHeader title={`Proposed changes (${analysis.changes.length})`} subtitle={`${analysis.files.length} files analysed${analysis.skipped?.length ? ` · ${analysis.skipped.length} skipped` : ''}${analysis.sharpAvailable ? '' : ' · Sharp unavailable: image dimensions/WebP disabled'}`}
              actions={analysis.changes.length ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(analysis.changes.map((c) => c.id)))}>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
                </>
              ) : null}
            />
            {analysis.changes.length ? (
              <div className="overflow-x-auto">
                <table className="table min-w-[760px]">
                  <thead><tr><th /><th>Rule</th><th>File</th><th>Description</th><th>Risk</th><th /></tr></thead>
                  <tbody>
                    {analysis.changes.map((c) => (
                      <tr key={c.id}>
                        <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.rule}`} /></td>
                        <td><code className="text-xs">{c.rule}</code></td>
                        <td className="max-w-[220px] break-all text-xs">{c.file}{c.line ? `:${c.line}` : ''}</td>
                        <td className="text-xs text-slate-600 dark:text-slate-300">{c.description}</td>
                        <td><Badge tone={RISK_TONE[c.risk] || 'slate'}>{c.risk}</Badge></td>
                        <td><Button size="sm" variant="ghost" onClick={() => setPreview(preview === c.id ? null : c.id)}>{preview === c.id ? 'Hide' : 'Preview'}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5"><EmptyState title="No automatic changes proposed" description="See manual review items below." className="py-6" /></div>
            )}
            {preview && (() => {
              const c = analysis.changes.find((x) => x.id === preview);
              return c ? (
                <div className="grid gap-3 border-t border-slate-100 p-5 xl:grid-cols-2 dark:border-slate-800">
                  <CodeBlock code={c.before || '(insert)'} language="html" tone="before" title={c.file} />
                  <CodeBlock code={c.after} language="html" tone="after" title={c.file} />
                </div>
              ) : null;
            })()}
          </Card>

          {analysis.advisories?.length > 0 && (
            <Card>
              <CardHeader icon={AlertTriangle} title={`Manual review (${analysis.advisories.length})`} subtitle="Found issues that need a human decision" />
              <ul className="space-y-1.5 p-5 text-sm">
                {analysis.advisories.map((a, i) => <li key={i}><code className="text-xs">{a.file}{a.line ? `:${a.line}` : ''}</code> – {a.message}</li>)}
              </ul>
            </Card>
          )}

          <Collapsible title={`Files (${analysis.files.length})`}>
            <div className="max-h-64 overflow-auto text-xs">
              {analysis.files.map((f) => (
                <div key={f.path} className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-1 dark:border-slate-800">
                  <span className="break-all">{f.path}</span>
                  <span className="shrink-0 text-slate-500">{formatBytes(f.bytes)}{f.image ? ` · ${f.image.width}×${f.image.height}` : ''}</span>
                </div>
              ))}
            </div>
          </Collapsible>

          {analysis.changes.length > 0 && (
            <Card className="space-y-4 p-5">
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" className="mt-1" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
                I reviewed these {selected.size} selected change(s); my original files stay unchanged and I will test the optimized copy before deploying.
              </label>
              <Button icon={Download} disabled={!approved || !selected.size} loading={busy === 'apply'} onClick={apply}>Generate optimized project (.zip)</Button>
              {result && (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={16} /> Downloaded ({formatBytes(result.size)}): {result.applied} change(s) applied{result.failed ? `, ${result.failed} not applied (see CHANGES.md)` : ''}.
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function CodeGenerator() {
  const { report, reportsLoading } = useApp();
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return ['scan', 'platform', 'hosting', 'delay', 'plugin', 'upload'].includes(t) ? t : 'scan';
  });
  return (
    <div>
      <PageHeader icon={Code2} title="Code Generator" description="Generate optimized HTML, CSS, JavaScript, Shopify Liquid and WordPress code, delay third-party scripts, build a WordPress optimisation plugin, or optimize an uploaded project." />
      <Tabs
        className="mb-5"
        tabs={[
          { key: 'scan', label: 'From scan' },
          { key: 'platform', label: 'Platform optimizer' },
          { key: 'hosting', label: 'Hosting & plugins' },
          { key: 'delay', label: 'Delay / lazy scripts' },
          { key: 'plugin', label: 'WordPress plugin' },
          { key: 'upload', label: 'Upload project' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'hosting' && (reportsLoading ? <Spinner /> : <HostingPlugins report={report} />)}
      {tab === 'delay' && (reportsLoading ? <Spinner /> : <DelayBuilder key={report?.id || 'none'} report={report} />)}
      {tab === 'plugin' && (reportsLoading ? <Spinner /> : <WpPluginBuilder key={report?.id || 'none'} report={report} />)}
      {tab === 'upload' && <UploadProject />}
      {tab === 'platform' && (reportsLoading ? <Spinner /> : <PlatformOptimizer report={report} />)}
      {tab === 'scan' && (reportsLoading ? <Spinner /> : report ? <FromScan key={report.id} report={report} /> : (
        <EmptyState title="No scan loaded" description="Run a scan to generate fixes from real audit evidence, or use the Upload project tab." action={<Link to="/analyzer"><Button>Analyze a website</Button></Link>} />
      ))}
    </div>
  );
}
