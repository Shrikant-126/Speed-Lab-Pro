// Shared CSS/JS sections: "which file is unused and who added it" and "what is render-blocking",
// plus clickable stat cards that jump to the matching section.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink, Ban, CheckCircle2, ArrowDown, Trash2 } from 'lucide-react';
import { formatBytes, formatMs, shortUrl, fileName, hostOf } from '@speedlab/shared/format';
import { Card, CardHeader, Badge, Stat, cx } from './ui.jsx';

export function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('ring-2', 'ring-brand-400');
  setTimeout(() => el.classList.remove('ring-2', 'ring-brand-400'), 1600);
}

/** Scroll to #section when the page is opened with a hash (links from Suggestions). */
export function useHashJump() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    const t = setTimeout(() => jumpTo(decodeURIComponent(hash.slice(1))), 300);
    return () => clearTimeout(t);
  }, [hash]);
}

/** A Stat card that scrolls to a section when clicked. */
export function JumpStat({ target, ...props }) {
  if (!target) return <Stat {...props} />;
  return (
    <button type="button" onClick={() => jumpTo(target)} className="group block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" title="Show details">
      <div className="relative transition group-hover:-translate-y-0.5">
        <Stat {...props} />
        <ArrowDown size={14} className="absolute bottom-3 right-3 text-slate-400 opacity-60 transition group-hover:text-brand-500 group-hover:opacity-100" />
      </div>
    </button>
  );
}

const ENTITY_TIPS = [
  [/maps\.google|maps\.googleapis|google maps/i, 'Google Maps: show a static map image and load the real map only when the visitor clicks it, or only on the contact page.'],
  [/recaptcha|gstatic\.com\/recaptcha/i, 'reCAPTCHA: load it only on pages that have a form (or when the visitor focuses the form), not site-wide.'],
  [/googletagmanager|gtag|google-analytics|analytics/i, 'Analytics/Tag Manager: delay until first user interaction (WP Rocket / Perfmatters "Delay JS") and remove unused tags.'],
  [/facebook|fbevents|connect\.facebook/i, 'Facebook Pixel: delay until user interaction.'],
  [/youtube|ytimg|vimeo/i, 'Video embed: use a click-to-play facade (thumbnail) instead of loading the player upfront.'],
  [/fonts\.googleapis|fonts\.gstatic/i, 'Google Fonts: self-host only the weights you use, with font-display: swap.'],
  [/jquery/i, 'jQuery: keep only if a plugin needs it; defer it and remove jQuery Migrate.'],
];

/** Who added this file: WordPress plugin/theme, Shopify, a 3rd-party service, or the site's own bundle. */
export function ownerOf(f) {
  const u = f.url || '';
  let m = u.match(/\/wp-content\/plugins\/([^/]+)\//i);
  if (m) return { label: `Plugin: ${m[1]}`, tone: 'amber', kind: 'plugin', name: m[1] };
  m = u.match(/\/wp-content\/themes\/([^/]+)\//i);
  if (m) return { label: `Theme: ${m[1]}`, tone: 'blue', kind: 'theme', name: m[1] };
  if (/\/wp-includes\//i.test(u)) return { label: 'WordPress core', tone: 'slate', kind: 'core' };
  if (/\/wp-content\/cache\/|\/cache\/min\/|\/litespeed\/|\/autoptimize\/|\/w3tc|\/siteground-optimizer|\/sgo-cache/i.test(u))
    return { label: 'Combined by cache plugin', tone: 'violet', kind: 'combined' };
  if (/cdn\.shopify|\/cdn\/shop\//i.test(u)) return { label: 'Shopify theme/app', tone: 'green', kind: 'shopify' };
  if (f.thirdParty) return { label: f.entity || hostOf(u) || '3rd party', tone: 'violet', kind: 'third' };
  if (/\/[a-z0-9]{6,10}\/[a-z0-9]{4,8}\.(css|js)(\?|$)/i.test(u)) return { label: 'Combined/optimized file', tone: 'violet', kind: 'combined' };
  return { label: 'Your site', tone: 'slate', kind: 'own' };
}

function tipFor(f, kind) {
  const hit = ENTITY_TIPS.find(([re]) => re.test(`${f.url} ${f.entity || ''}`));
  if (hit) return hit[1];
  const o = ownerOf(f);
  const p = f.unusedPercent ?? 0;
  if (o.kind === 'plugin') return `Plugin "${o.name}" loads this on every page. Unload it on pages that don't use the plugin (Asset CleanUp / Perfmatters Script Manager).`;
  if (o.kind === 'theme') return kind === 'css' ? 'Theme stylesheet: enable "Remove unused CSS" (WP Rocket / LiteSpeed / Perfmatters) or generate critical CSS.' : 'Theme script: defer it and disable theme features you do not use.';
  if (o.kind === 'combined') return kind === 'css'
    ? 'Optimization plugin combined several CSS files here. Turn on its "Remove unused CSS / Used CSS" option; to find the original source, disable "Combine CSS" and rescan.'
    : 'Optimization plugin combined several scripts here. Turn on "Delay JavaScript execution"; to find the original source, disable "Combine JS" and rescan.';
  if (kind === 'css') return p > 70 ? 'Mostly unused on this page — load it only on pages that need it, or purge unused rules.' : 'Purge unused selectors (PurgeCSS) or split it per page template.';
  return p > 60 ? 'Mostly unused during load — code-split it or delay it until user interaction.' : 'Defer it and split rarely-used code into a lazily loaded chunk.';
}

function Bar({ percent }) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 60 ? '#ff4e42' : p > 30 ? '#ffa400' : '#0cce6b' }} />
    </div>
  );
}

function FileCell({ f }) {
  const o = ownerOf(f);
  return (
    <div className="min-w-0">
      <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-[420px] items-center gap-1 font-medium text-slate-800 hover:text-brand-600 hover:underline dark:text-slate-100" title={f.url}>
        <span className="truncate">{fileName(f.url)}</span> <ExternalLink size={11} className="shrink-0" />
      </a>
      <p className="max-w-[420px] break-all text-xs text-slate-400">{shortUrl(f.url, 90)}</p>
      <Badge tone={o.tone} className="mt-1">{o.label}</Badge>
    </div>
  );
}

/** "Reduce unused CSS/JS" — grouped by 1st party / each 3rd party, like PageSpeed Insights, with a fix per file. */
export function UnusedFilesCard({ id, files, kind, minBytes = 1024, source }) {
  const list = (files || []).filter((f) => (f.unusedBytes || 0) >= minBytes).sort((a, b) => b.unusedBytes - a.unusedBytes);
  const total = list.reduce((s, f) => s + f.unusedBytes, 0);
  const label = kind === 'css' ? 'CSS' : 'JavaScript';
  const groups = new Map();
  for (const f of list) {
    const key = f.thirdParty ? f.entity || hostOf(f.url) || '3rd party' : hostOf(f.url) || 'This site';
    const g = groups.get(key) || { name: key, third: !!f.thirdParty, files: [], unused: 0, size: 0 };
    g.files.push(f);
    g.unused += f.unusedBytes;
    g.size += f.transferSize || 0;
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => (a.third - b.third) || b.unused - a.unused);

  return (
    <Card id={id} className="scroll-mt-20 transition">
      <CardHeader
        icon={Trash2}
        title={`Unused ${label} — which files`}
        subtitle={list.length ? `${formatBytes(total)} of ${label} is downloaded but not used on this page · ${list.length} file${list.length === 1 ? '' : 's'}` : `No file has significant unused ${label}`}
      />
      {list.length ? (
        <div className="overflow-x-auto p-2">
          <table className="table">
            <thead>
              <tr>
                <th>File &amp; who added it</th>
                <th className="text-right">Transfer size</th>
                <th className="min-w-[150px]">Unused (est. savings)</th>
                <th className="min-w-[260px]">What to do</th>
              </tr>
            </thead>
            {sorted.map((g) => (
              <tbody key={g.name}>
                <tr className="bg-slate-50 dark:bg-slate-800/40">
                  <td className="font-semibold">
                    {g.name} <Badge tone={g.third ? 'violet' : 'blue'} className="ml-1">{g.third ? '3rd party' : '1st party'}</Badge>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{formatBytes(g.size)}</td>
                  <td className="font-semibold tabular-nums">{formatBytes(g.unused)}</td>
                  <td />
                </tr>
                {g.files.map((f) => (
                  <tr key={f.url}>
                    <td className="pl-6"><FileCell f={f} /></td>
                    <td className="text-right tabular-nums">{f.transferSize != null ? formatBytes(f.transferSize) : '—'}</td>
                    <td>
                      <div className="flex justify-between gap-2 text-sm tabular-nums">
                        <b className="text-red-600 dark:text-red-400">{formatBytes(f.unusedBytes)}</b>
                        <span className="text-slate-500">{(f.unusedPercent ?? 0).toFixed(0)}%</span>
                      </div>
                      <Bar percent={f.unusedPercent} />
                    </td>
                    <td className="text-xs text-slate-600 dark:text-slate-300">{tipFor(f, kind)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <p className="px-3 pb-2 pt-3 text-xs text-slate-500">
            {source || 'Source: Lighthouse coverage.'} "Unused" means the code was not used while this page loaded — some of it may be needed on other pages or after a click, so remove it per page rather than deleting the file.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-5 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} /> Nothing significant to remove.</div>
      )}
    </Card>
  );
}

/** Every render-blocking CSS/JS file, with how long it delays the first paint and the exact fix. */
export function RenderBlockingCard({ id, report }) {
  const css = (report.css?.files || []).filter((f) => f.renderBlocking).map((f) => ({ ...f, kind: 'css' }));
  const js = (report.js?.files || []).filter((f) => f.renderBlocking).map((f) => ({ ...f, kind: 'js' }));
  const list = [...css, ...js].sort((a, b) => (b.blockingMs || 0) - (a.blockingMs || 0) || (b.transferSize || 0) - (a.transferSize || 0));
  const totalMs = list.reduce((m, f) => Math.max(m, f.blockingMs || 0), 0);
  const fix = (f) => {
    if (f.kind === 'js') return <>Add <code>defer</code> to the &lt;script&gt; tag (or move it to the end of &lt;body&gt;). In WordPress: WP Rocket / Perfmatters → "Defer JavaScript".</>;
    if ((f.unusedPercent ?? 0) > 70) return <>Mostly unused here ({(f.unusedPercent).toFixed(0)}%). Load it only on pages that need it, or remove it.</>;
    if (/fonts\.googleapis/i.test(f.url)) return <>Self-host the font, or load with <code>media="print" onload="this.media='all'"</code> + preconnect.</>;
    return <>Inline the critical (above-the-fold) CSS in &lt;head&gt; and load this file without blocking: <code>media="print" onload="this.media='all'"</code>. In WordPress: "Remove unused CSS" / "Load CSS asynchronously".</>;
  };
  return (
    <Card id={id} className="scroll-mt-20 transition">
      <CardHeader
        icon={Ban}
        title="Render-blocking resources"
        subtitle={list.length
          ? `${css.length} CSS + ${js.length} script${js.length === 1 ? '' : 's'} must download before anything is shown${totalMs ? ` · up to ${formatMs(totalMs)} delay to first paint (FCP/LCP)` : ''}`
          : 'Nothing blocks the first paint'}
      />
      {list.length ? (
        <div className="overflow-x-auto p-2">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>File &amp; who added it</th>
                <th className="text-right">Size</th>
                <th className="text-right">Blocks paint for</th>
                <th className="min-w-[280px]">Fix</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.url}>
                  <td><Badge tone={f.kind === 'css' ? 'blue' : 'amber'}>{f.kind.toUpperCase()}</Badge></td>
                  <td><FileCell f={f} /></td>
                  <td className="text-right tabular-nums">{f.transferSize != null ? formatBytes(f.transferSize) : '—'}</td>
                  <td className={cx('text-right font-semibold tabular-nums', (f.blockingMs || 0) > 300 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>{f.blockingMs ? formatMs(f.blockingMs) : '—'}</td>
                  <td className="text-xs text-slate-600 dark:text-slate-300">{fix(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 pb-2 pt-3 text-xs text-slate-500">
            Only CSS and synchronous scripts in &lt;head&gt; can block rendering. Images never block rendering (a slow image delays LCP instead — see Image Optimizer / LCP Analysis); fonts can hide text until they load (see Web fonts).
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-5 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} /> No render-blocking CSS or JavaScript.</div>
      )}
    </Card>
  );
}
