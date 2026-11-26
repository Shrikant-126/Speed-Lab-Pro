// PageSpeed-Insights-style list of Lighthouse Insights and Diagnostics: a row per audit with its
// rating icon and "Est savings", expandable to the affected files/elements (with screenshots) and
// a short, plain fix plus a link to the detailed SpeedLab page.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, Wrench, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatBytes, formatMs, fileName, hostOf } from '@speedlab/shared/format';
import { Badge, Notice, cx } from './ui.jsx';
import { ElementShot } from './MetricDiagnosis.jsx';

/* ------------------------------------------------------------------ fixes */

const FIX = {
  images: { to: '/images', label: 'Open Image Optimizer', steps: ['Resize each image to the size it is displayed at (the table shows file vs displayed size).', 'Convert JPEG/PNG to WebP or AVIF at quality 75–80.', 'Add loading="lazy" to images below the first screen; never lazy-load the LCP image.'] },
  renderBlocking: { to: '/css#css-render-blocking', label: 'See render-blocking files', steps: ['CSS: inline the critical (above-the-fold) CSS and load the rest asynchronously.', 'JavaScript: add defer to every <script> in <head> that is not needed for the first paint.', 'WordPress: WP Rocket / LiteSpeed / Perfmatters → "Load CSS asynchronously" and "Defer JavaScript".'] },
  cache: { to: '/network', label: 'Open Network Analysis', steps: ['Give static files (images, CSS, JS, fonts) a long cache lifetime: Cache-Control: public, max-age=31536000, immutable.', 'Use versioned file names (style.css?ver=123) so updates are still picked up.', 'WordPress: enable "browser caching" in your cache plugin, or add expires rules to .htaccess / your CDN.', 'Third-party files (Google, Facebook…) cannot be changed — remove or delay them instead.'] },
  reflow: { to: '/javascript#js-mainthread', label: 'Open JavaScript Analyzer', steps: ['A script reads layout (offsetWidth, getBoundingClientRect, scrollTop…) right after changing styles, forcing the browser to recalculate layout.', 'Batch DOM reads before writes, or move the read into requestAnimationFrame.', 'The table shows which script does it — usually a slider, sticky header or animation plugin; update or replace it.'] },
  network: { to: '/network', label: 'Open Network Analysis', steps: ['The tree shows files that are only discovered after another file loads (HTML → CSS → font…). Each level adds a round trip.', 'Preload the critical font / hero image and preconnect to the 2–4 most important origins.', 'Inline critical CSS and remove @import chains; defer anything not needed for the first screen.'] },
  font: { to: '/css', label: 'See web fonts', steps: ['Add font-display: swap to every @font-face so text shows immediately with a fallback font.', 'Google Fonts: add &display=swap to the URL (or self-host the fonts).', 'Preload only the 1–2 fonts used above the fold.'] },
  legacyJs: { to: '/javascript', label: 'Open JavaScript Analyzer', steps: ['These files include polyfills/transpiled code for old browsers that modern browsers do not need.', 'Update the plugin/theme, or build with a modern target (no ES5 transpile, no core-js for modern browsers).'] },
  cls: { to: '/core-web-vitals', label: 'See CLS elements', steps: ['Add width and height (or CSS aspect-ratio) to images, videos and iframes.', 'Reserve space for banners, ads, embeds and cookie bars.', 'Use font-display: optional or matching fallback-font metrics to stop text jumping.'] },
  lcp: { to: '/lcp', label: 'Open LCP Analysis', steps: ['Make the LCP element (shown below) load first: no lazy-loading, add fetchpriority="high".', 'If it is a CSS background or added by JavaScript, preload it in <head>.', 'Reduce server response time and render-blocking CSS that delay it.'] },
  third: { to: '/third-party', label: 'Open Third-Party analysis', steps: ['Remove third-party scripts you do not need.', 'Delay chat widgets, analytics, pixels and maps until the first user interaction.', 'Replace YouTube/Maps embeds with click-to-load facades.'] },
  ttfb: { to: '/network', label: 'Open Network Analysis', steps: ['Enable full-page caching (WP Rocket, LiteSpeed Cache, Cloudflare APO).', 'Use a CDN and avoid redirects to the final URL.', 'Enable Brotli/gzip compression; upgrade slow hosting.'] },
  dom: { to: '/javascript', label: 'Open JavaScript Analyzer', steps: ['Reduce the number of HTML elements: remove hidden sections, nested page-builder wrappers and mega-menus rendered on every page.', 'Paginate or lazy-render long lists.'] },
  duplicate: { to: '/javascript', label: 'Open JavaScript Analyzer', steps: ['The same library is loaded more than once (often by two plugins). Keep one copy and dequeue the other.'] },
  unusedCss: { to: '/css#css-unused', label: 'See unused CSS by file', steps: ['Turn on "Remove unused CSS / Used CSS" in your optimization plugin.', 'Unload plugin stylesheets on pages that do not use the plugin (Asset CleanUp / Perfmatters).'] },
  unusedJs: { to: '/javascript#js-unused', label: 'See unused JavaScript by file', steps: ['Delay non-critical scripts until user interaction.', 'Unload plugin scripts on pages that do not use them; load maps/reCAPTCHA only where needed.'] },
  js: { to: '/javascript#js-mainthread', label: 'Open JavaScript Analyzer', steps: ['The scripts at the top of the table cost the most CPU. Remove, delay or replace them.', 'Delay third-party scripts until interaction and defer the rest.'] },
  minify: { to: '/code-generator', label: 'Open Code Generator', steps: ['Enable CSS/JS minification in your cache/optimization plugin or build tool.'] },
  compression: { to: '/network', label: 'Open Network Analysis', steps: ['Enable Brotli or gzip on the server/CDN for HTML, CSS, JS and SVG.'] },
  animation: { to: '/javascript', label: 'Open JavaScript Analyzer', steps: ['Animate only transform and opacity; avoid animating width, height, top, left or background.'] },
  weight: { to: '/images', label: 'Open Image Optimizer', steps: ['Images and JavaScript are usually most of the weight — optimize images and remove unused scripts.'] },
  viewport: { to: '/seo', label: 'Open SEO', steps: ['Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.'] },
};

const FIX_BY_ID = [
  [/image-delivery|responsive-images|modern-image|optimized-images|offscreen-images|efficient-animated|unsized-images/, 'images'],
  [/render-blocking/, 'renderBlocking'],
  [/cache-insight|long-cache-ttl/, 'cache'],
  [/forced-reflow/, 'reflow'],
  [/network-dependency|critical-request-chains|uses-rel-preconnect|uses-rel-preload/, 'network'],
  [/font-display/, 'font'],
  [/legacy-javascript/, 'legacyJs'],
  [/cls-culprits|layout-shift/, 'cls'],
  [/lcp-|largest-contentful-paint-element|prioritize-lcp/, 'lcp'],
  [/third-part/, 'third'],
  [/document-latency|server-response|redirects/, 'ttfb'],
  [/dom-size/, 'dom'],
  [/duplicated-javascript/, 'duplicate'],
  [/unused-css/, 'unusedCss'],
  [/unused-javascript/, 'unusedJs'],
  [/bootup-time|mainthread-work|long-tasks/, 'js'],
  [/unminified/, 'minify'],
  [/text-compression/, 'compression'],
  [/non-composited/, 'animation'],
  [/total-byte-weight/, 'weight'],
  [/viewport/, 'viewport'],
];
const fixFor = (id) => FIX[FIX_BY_ID.find(([re]) => re.test(id))?.[1]] || null;

/* ------------------------------------------------------------- rendering */

/** Minimal Markdown for Lighthouse descriptions: [text](url) and `code`. */
function Md({ text }) {
  const parts = String(text || '').split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g);
  return parts.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">{link[1]}</a>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="rounded bg-slate-100 px-1 text-[0.85em] dark:bg-white/10">{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const isImageUrl = (u) => /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(u || '');

function UrlCell({ url }) {
  if (!url) return '—';
  if (!/^https?:/i.test(url)) return <span className="break-all">{url}</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {isImageUrl(url) && (
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 rounded object-cover ring-1 ring-slate-200 dark:ring-white/10" />
      )}
      <div className="min-w-0">
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-[380px] items-center gap-1 text-slate-800 hover:text-brand-600 hover:underline dark:text-slate-100" title={url}>
          <span className="truncate">…{fileName(url).slice(-40)}</span> <ExternalLink size={10} className="shrink-0" />
        </a>
        <p className="text-[11px] text-slate-400">({hostOf(url)})</p>
      </div>
    </div>
  );
}

function NodeCell({ node, shot }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {node.rect && shot ? <ElementShot shot={shot} rect={node.rect} maxW={120} maxH={80} pad={12} /> : null}
      <div className="min-w-0">
        {node.nodeLabel && <p className="max-w-[360px] truncate text-slate-700 dark:text-slate-200">{node.nodeLabel}</p>}
        {node.selector && <p className="max-w-[360px] truncate text-[11px] text-slate-400">{node.selector}</p>}
        {node.snippet && <code className="mt-0.5 block max-w-[360px] truncate text-[11px] text-brand-700 dark:text-brand-300" title={node.snippet}>{node.snippet}</code>}
      </div>
    </div>
  );
}

function cell(v, type, shot, granularity) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') {
    if (v.type === 'node') return <NodeCell node={v} shot={shot} />;
    if (v.type === 'url') return <UrlCell url={v.value} />;
    if (v.type === 'source-location') return <span className="break-all text-xs"><UrlCell url={v.url} />{v.line != null ? `:${v.line + 1}` : ''}</span>;
    if (v.type === 'code') return <code className="text-xs">{v.value}</code>;
    if (v.type === 'link') return <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{v.text}</a>;
    if (v.type === 'numeric') return cell(v.value, type, shot, v.granularity);
    if (v.type === 'text') return v.value;
    if (v.type === 'thumbnail') return v.url ? <img src={v.url} alt="" className="h-10 w-14 rounded object-cover" referrerPolicy="no-referrer" /> : '';
    return '';
  }
  if (typeof v === 'number') {
    if (type === 'bytes') return formatBytes(v);
    if (type === 'ms' || type === 'timespanMs') return formatMs(v);
    if (type === 'numeric') return granularity && granularity < 1 ? v.toFixed(3) : Math.round(v).toLocaleString();
    return v.toLocaleString();
  }
  if (type === 'url' || /^https?:\/\//.test(v)) return <UrlCell url={v} />;
  if (type === 'code') return <code className="text-xs">{v}</code>;
  return <span className="break-words">{String(v)}</span>;
}

function Table({ d, shot }) {
  const heads = d.headings || [];
  const groups = [];
  const grouped = d.items.some((it) => typeof it.entity === 'string');
  for (const it of d.items) {
    const key = grouped ? it.entity || 'Other' : '';
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, items: [] }));
    g.items.push(it);
  }
  const total = (items, h) => (['bytes', 'ms', 'timespanMs'].includes(h.valueType) ? items.reduce((s, it) => s + (typeof it[h.key] === 'number' ? it[h.key] : it[h.key]?.value || 0), 0) : null);
  const right = (h) => ['bytes', 'ms', 'timespanMs', 'numeric'].includes(h.valueType);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
      <table className="table text-sm">
        <thead>
          <tr>{heads.map((h) => <th key={h.key} className={cx(right(h) && 'text-right')}>{h.label}</th>)}</tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {grouped && (
                <tr className="bg-slate-50 dark:bg-white/[0.04]">
                  {heads.map((h, i) => (
                    <td key={h.key} className={cx('font-semibold', right(h) && 'text-right tabular-nums')}>
                      {i === 0 ? g.key : total(g.items, h) ? cell(total(g.items, h), h.valueType) : ''}
                    </td>
                  ))}
                </tr>
              )}
              {g.items.map((it, r) => (
                <Fragment key={r}>
                  <tr>
                    {heads.map((h) => <td key={h.key} className={cx('align-top', right(h) && 'whitespace-nowrap text-right tabular-nums', grouped && h === heads[0] && 'pl-6')}>{cell(it[h.key], h.valueType, shot, h.granularity)}</td>)}
                  </tr>
                  {(it.subItems?.items || []).map((s, si) => (
                    <tr key={`s${si}`} className="text-xs text-slate-500">
                      {heads.map((h) => (
                        <td key={h.key} className={cx('border-t-0 pt-0 align-top', right(h) && 'text-right tabular-nums', h === heads[0] && 'pl-8')}>
                          {h.sub ? cell(s[h.sub.key], h.sub.valueType, shot) : s[h.key] !== undefined ? cell(s[h.key], h.valueType, shot) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      {d.more > 0 && <p className="px-3 py-2 text-xs text-slate-400">+ {d.more} more rows not shown</p>}
    </div>
  );
}

function Tree({ chains, depth = 0 }) {
  if (!chains) return null;
  return (
    <ul className={cx(depth > 0 && 'ml-4 border-l border-slate-200 pl-3 dark:border-white/10')}>
      {Object.entries(chains).map(([id, c]) => (
        <li key={id} className="py-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className={cx('break-all', c.isLongest && 'font-semibold text-red-600 dark:text-red-400')}>{c.url ? `…${(() => { try { const u = new URL(c.url); return u.pathname.length > 1 ? u.pathname.slice(-50) : u.host; } catch { return c.url; } })()}` : id}</span>
            {c.url && <span className="text-[11px] text-slate-400">({hostOf(c.url)})</span>}
            {c.navStartToEndTime != null && <span className="tabular-nums text-xs text-slate-500">· {formatMs(c.navStartToEndTime)}</span>}
            {c.transferSize != null && <span className="tabular-nums text-xs text-slate-500">· {formatBytes(c.transferSize)}</span>}
          </div>
          <Tree chains={c.children} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function Details({ d, shot }) {
  if (!d) return null;
  if (d.type === 'table') return d.items?.length ? <Table d={d} shot={shot} /> : null;
  if (d.type === 'list') return <div className="space-y-4">{d.items.map((x, i) => <Details key={i} d={x} shot={shot} />)}</div>;
  if (d.type === 'list-section') {
    return (
      <div className="space-y-2">
        {d.title && <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{d.title}</p>}
        {d.description && <p className="text-xs text-slate-500"><Md text={d.description} /></p>}
        <Details d={d.value} shot={shot} />
      </div>
    );
  }
  if (d.type === 'network-tree') {
    return (
      <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
        {d.longestChain?.duration != null && <p className="mb-2 text-xs text-slate-500">Maximum critical path latency: <b className="text-red-600 dark:text-red-400">{formatMs(d.longestChain.duration)}</b> (red = longest chain)</p>}
        <Tree chains={d.chains} />
      </div>
    );
  }
  if (d.type === 'checklist') {
    return (
      <ul className="space-y-1 text-sm">
        {Object.entries(d.items).map(([k, v]) => (
          <li key={k} className="flex items-center gap-2">{v.value ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="h-3 w-3 rounded-full border-2 border-red-500" />}{v.label}</li>
        ))}
      </ul>
    );
  }
  if (d.type === 'text') return <p className="text-sm text-slate-600 dark:text-slate-300">{d.value}</p>;
  if (d.type === 'node') return <NodeCell node={d} shot={shot} />;
  return null;
}

/* --------------------------------------------------------------- rows */

function RatingIcon({ rating }) {
  if (rating === 'fail') return <span className="h-0 w-0 shrink-0 border-x-[6px] border-b-[11px] border-x-transparent border-b-[#ff4e42]" aria-label="Failed" />;
  if (rating === 'average') return <span className="h-2.5 w-2.5 shrink-0 bg-[#ffa400]" aria-label="Needs improvement" />;
  if (rating === 'pass') return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0cce6b]" aria-label="Passed" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-400" aria-label="Informative" />;
}

export function AuditRow({ a, shot, open, onToggle }) {
  const fix = fixFor(a.id);
  const tags = Object.keys(a.metricSavings || {});
  return (
    <li className="border-b border-slate-200 last:border-0 dark:border-white/[0.08]">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.03]" aria-expanded={open}>
        <RatingIcon rating={a.rating} />
        <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">
          {a.title}
          {a.displayValue && <span className={cx('ml-1', a.rating === 'fail' ? 'text-red-600 dark:text-[#ff7a6e]' : a.rating === 'average' ? 'text-amber-600 dark:text-[#ffc14d]' : 'text-slate-500')}> — {a.displayValue}</span>}
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-5 pl-10">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <Md text={a.description} />{' '}
            {tags.map((t) => <Badge key={t} className="ml-1">{t}</Badge>)}
          </p>
          {a.stackPackHint && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
              <b>WordPress:</b> <Md text={a.stackPackHint} />
            </div>
          )}
          <Details d={a.details} shot={shot} />
          {fix && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100"><Wrench size={15} /> How to fix</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-emerald-900 dark:text-emerald-100">
                {fix.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
              <Link to={fix.to} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                {fix.label} <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const METRIC_FILTERS = ['All', 'FCP', 'LCP', 'TBT', 'CLS'];

export default function PsiAudits({ report }) {
  const data = report.audits;
  const [metric, setMetric] = useState('All');
  const [open, setOpen] = useState({});
  const [showPassed, setShowPassed] = useState(false);
  if (!data?.groups) {
    return <Notice tone="warn">This report was created before the PageSpeed-style view was added. Press <b>Retest</b> on the Overview page to see Insights and Diagnostics here.</Notice>;
  }
  const shot = report.diagnosis?.screenshot || null;
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const keep = (a) => metric === 'All' || (a.metricSavings || {})[metric] > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Show audits relevant to:</span>
        {METRIC_FILTERS.map((m) => (
          <button key={m} type="button" onClick={() => setMetric(m)} className={cx('rounded-full border px-3 py-1 text-xs font-semibold transition', metric === m ? 'border-brand-400 bg-brand-400 text-[#04090a]' : 'border-slate-300 text-slate-600 hover:border-brand-400 dark:border-white/15 dark:text-slate-300')}>
            {m}
          </button>
        ))}
      </div>
      {data.groups.map((g) => {
        const list = g.audits.filter(keep);
        if (!list.length) return null;
        return (
          <section key={g.key} className="card overflow-hidden">
            <h3 className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/[0.08]">{g.title}</h3>
            <ul>{list.map((a) => <AuditRow key={a.id} a={a} shot={shot} open={!!open[a.id]} onToggle={() => toggle(a.id)} />)}</ul>
          </section>
        );
      })}
      {data.passed?.length > 0 && (
        <section className="card overflow-hidden">
          <button type="button" onClick={() => setShowPassed((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            Passed audits ({data.passed.length}) <ChevronDown size={16} className={cx('transition', showPassed && 'rotate-180')} />
          </button>
          {showPassed && (
            <ul className="border-t border-slate-200 dark:border-white/[0.08]">
              {data.passed.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-300"><RatingIcon rating="pass" /> {p.title}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
