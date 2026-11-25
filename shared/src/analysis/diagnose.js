// Per-metric diagnosis: for each Core Web Vital, the elements / resources Lighthouse blamed,
// why they hurt the metric and how to fix them. Elements carry their on-page rectangle so the
// client can crop them out of the Lighthouse screenshot. Nothing here is estimated: an empty
// list means Lighthouse found no culprit in this run.

import { audit, rows, nodes, subItems, urlOf } from './lhr.js';

const MAX_FULLPAGE_BYTES = 1_500_000;
const isImage = (d, max) => typeof d === 'string' && d.startsWith('data:image/') && d.length <= max;

/** Lighthouse's full-page screenshot (preferred) or the viewport screenshot. */
function pageShot(lhr) {
  const fp = lhr?.fullPageScreenshot || lhr?.audits?.['full-page-screenshot']?.details;
  if (isImage(fp?.screenshot?.data, MAX_FULLPAGE_BYTES) && fp.screenshot.width) {
    return { kind: 'full-page', data: fp.screenshot.data, width: fp.screenshot.width, height: fp.screenshot.height || null, nodes: fp.nodes || {} };
  }
  const final = lhr?.audits?.['final-screenshot']?.details?.data;
  if (isImage(final, 400_000)) {
    const emu = lhr?.configSettings?.screenEmulation || {};
    const desktop = lhr?.configSettings?.formFactor === 'desktop';
    return { kind: 'viewport', data: final, width: emu.width || (desktop ? 1350 : 412), height: emu.height || (desktop ? 940 : 823), nodes: {} };
  }
  return null;
}

function rectOf(node, shot) {
  const r = (node?.lhId && shot?.nodes?.[node.lhId]) || node?.boundingRect;
  if (!r || !(r.width > 0) || !(r.height > 0)) return null;
  const rect = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  // The viewport screenshot can only show elements inside the first screen.
  if (shot?.kind === 'viewport' && rect.top >= shot.height) return null;
  return rect;
}

function elementOf(node, shot) {
  if (!node) return null;
  return {
    selector: node.selector || null,
    snippet: node.snippet ? String(node.snippet).slice(0, 300) : null,
    label: node.nodeLabel ? String(node.nodeLabel).slice(0, 160) : null,
    rect: rectOf(node, shot),
  };
}

const tagOf = (snippet) => (snippet?.match(/^<([a-z0-9-]+)/i)?.[1] || '').toLowerCase();

// ---- CLS -------------------------------------------------------------------

const CLS_CAUSES = [
  {
    re: /unsized|image|img/i,
    cause: 'Image without width/height',
    fix: 'Add width and height attributes (or CSS aspect-ratio) to the image so the browser reserves its space before it downloads.',
  },
  {
    re: /font/i,
    cause: 'Web font swap',
    fix: 'The fallback font and the web font have different sizes. Preload the font and use font-display: optional, or a size-adjusted fallback (@font-face with size-adjust / ascent-override).',
  },
  {
    re: /iframe|inject|dynamic|content/i,
    cause: 'Content injected after render',
    fix: 'An embed, banner, widget or app block was inserted after the page painted. Reserve its space up front with min-height, or render it in the initial HTML.',
  },
  {
    re: /animation|animated/i,
    cause: 'Non-composited animation',
    fix: 'Animate with transform and opacity only – animating top/left/height/margin moves surrounding content.',
  },
];

const POPUP_RE = /modal|popup|pop-up|dialog|klaviyo|needsclick|privy|justuno|omnisend|newsletter|signup|sign-up|optin|opt-in/i;
const BAR_RE = /announcement|marquee|ticker|top-?bar|promo-?bar|notice-?bar|header/i;

function explainShift(causeText, node) {
  const snippet = node?.snippet || '';
  const where = `${snippet} ${node?.selector || ''}`;
  const c = CLS_CAUSES.find((x) => causeText && x.re.test(causeText));
  if (c) return { cause: c.cause, fix: c.fix };
  if (tagOf(snippet) === 'img') return { cause: CLS_CAUSES[0].cause, fix: CLS_CAUSES[0].fix };
  if (POPUP_RE.test(where)) {
    return {
      cause: 'Popup / signup form appearing',
      fix: 'This popup moves or resizes after it appears. Render it as a position: fixed overlay that never pushes page content, open it with a transform/opacity animation (not height/top/margin), and show it after user interaction or a delay instead of during page load.',
    };
  }
  if (BAR_RE.test(where)) {
    return {
      cause: 'Announcement bar / header resizing',
      fix: 'Give the announcement bar and header a fixed height (min-height) in CSS so rotating messages, countdowns or late-loading text cannot change their size and push the page down.',
    };
  }
  return {
    cause: 'Pushed by content above it',
    fix: 'This element moved because something above it changed size after first paint (late banner, slider initialising, reviews/app widget, font swap). Give that content a fixed min-height or render it server-side.',
  };
}

function diagnoseCls(lhr, shot) {
  const items = [];
  const a = audit(lhr, 'cls-culprits-insight', 'layout-shifts', 'layout-shift-elements');
  for (const r of rows(a)) {
    const node = r.node?.type === 'node' ? r.node : nodes({ details: r })[0];
    if (!node) continue;
    const subs = subItems(r);
    const causeText = subs.map((s) => s.cause || s.extra?.type || '').filter(Boolean).join(' ');
    const related = subs.map((s) => (typeof s.extra?.value === 'string' ? s.extra.value : s.extra?.url || null)).filter(Boolean);
    const { cause, fix } = explainShift(causeText, node);
    const score = typeof r.score === 'number' ? r.score : typeof r.value === 'number' ? r.value : null;
    items.push({
      title: node.nodeLabel || node.selector || 'Shifted element',
      value: score,
      valueLabel: score !== null ? (score < 0.001 ? 'shift < 0.001' : `shift ${score.toFixed(3)}`) : null,
      cause: subs.length ? subs.map((s) => s.cause).filter(Boolean).join(', ') || cause : cause,
      fix,
      related: related.slice(0, 3),
      element: elementOf(node, shot),
    });
  }
  // Images that can shift the layout even if they did not in this run.
  for (const r of rows(audit(lhr, 'unsized-images'))) {
    const node = r.node?.type === 'node' ? r.node : null;
    if (!node || items.some((i) => i.element?.selector && i.element.selector === node.selector)) continue;
    items.push({
      title: node.nodeLabel || urlOf(r) || 'Unsized image',
      value: null,
      valueLabel: 'risk',
      cause: CLS_CAUSES[0].cause,
      fix: CLS_CAUSES[0].fix,
      related: urlOf(r) ? [urlOf(r)] : [],
      element: elementOf(node, shot),
    });
  }
  items.sort((x, y) => (y.value ?? -1) - (x.value ?? -1));
  return items.slice(0, 12);
}

// ---- LCP -------------------------------------------------------------------

function diagnoseLcp(lhr, shot, lcp) {
  const a = audit(lhr, 'lcp-breakdown-insight', 'lcp-phases-insight', 'largest-contentful-paint-element');
  const node = nodes(a)[0] || nodes(audit(lhr, 'lcp-discovery-insight', 'prioritize-lcp-image'))[0];
  if (!node && !lcp?.element) return [];
  const dom = lcp?.dominantPhase;
  const fixByPhase = {
    ttfb: 'Speed up the server response: page caching / CDN, fewer redirects, faster hosting.',
    loadDelay: 'Make the image discoverable in the HTML: use an <img> (not CSS background / JS), remove loading="lazy", add fetchpriority="high" or a <link rel="preload">.',
    loadDuration: 'Make the file smaller: right-size it with srcset, serve AVIF/WebP, compress it, serve from a CDN.',
    renderDelay: 'Unblock painting: inline critical CSS, defer JS, and do not hide the hero until a slider/animation script runs.',
  };
  return [
    {
      title: node?.nodeLabel || lcp?.element?.text || lcp?.element?.selector || 'LCP element',
      value: dom?.ms ?? null,
      valueLabel: dom ? `${dom.label}: ${(dom.ms / 1000).toFixed(2)} s` : null,
      cause: dom ? `Largest part of LCP is “${dom.label}”. ${dom.explanation || ''}`.trim() : `This ${lcp?.type || 'element'} is the largest content painted in the first screen.`,
      fix: (dom && fixByPhase[dom.key]) || fixByPhase.loadDelay,
      related: lcp?.imageUrl ? [lcp.imageUrl] : [],
      element: elementOf(node || { selector: lcp.element.selector, snippet: lcp.element.snippet, boundingRect: lcp.element.boundingRect }, shot),
    },
  ];
}

// ---- FCP / Speed Index -----------------------------------------------------

function diagnoseFcp(lhr) {
  const items = [];
  for (const r of rows(audit(lhr, 'render-blocking-insight', 'render-blocking-resources'))) {
    const u = urlOf(r);
    if (!u) continue;
    const css = /\.css(\?|$)/i.test(u) || /stylesheet/i.test(r.resourceType || '');
    const ms = r.wastedMs ?? r.duration ?? null;
    items.push({
      title: u,
      value: typeof ms === 'number' ? ms : null,
      valueLabel: typeof ms === 'number' ? `blocks ${Math.round(ms)} ms` : 'render-blocking',
      cause: css ? 'Render-blocking stylesheet' : 'Render-blocking script',
      fix: css
        ? 'Inline the critical (above-the-fold) CSS and load this file with media="print" onload="this.media=\'all\'" or split it per template.'
        : 'Add defer (or async) to this <script>, or move it to the end of <body>.',
      related: [],
      element: null,
    });
  }
  for (const r of rows(audit(lhr, 'font-display-insight', 'font-display'))) {
    const u = urlOf(r);
    if (!u) continue;
    items.push({
      title: u,
      value: typeof r.wastedMs === 'number' ? r.wastedMs : null,
      valueLabel: typeof r.wastedMs === 'number' ? `text hidden ${Math.round(r.wastedMs)} ms` : 'invisible text',
      cause: 'Font without font-display',
      fix: 'Add font-display: swap (or optional) to this @font-face so text shows immediately in a fallback font.',
      related: [],
      element: null,
    });
  }
  return items.sort((x, y) => (y.value ?? -1) - (x.value ?? -1)).slice(0, 10);
}

// ---- TTFB ------------------------------------------------------------------

function diagnoseTtfb(lhr, lab) {
  const items = [];
  const redirects = rows(audit(lhr, 'redirects'));
  if (redirects.length > 1) {
    items.push({
      title: `${redirects.length - 1} redirect${redirects.length > 2 ? 's' : ''} before the page`,
      value: redirects.reduce((s, r) => s + (r.wastedMs || 0), 0) || null,
      valueLabel: null,
      cause: 'Redirect chain',
      fix: 'Link directly to the final URL (https, www/non-www, trailing slash) so the browser does not wait for extra round trips.',
      related: redirects.map(urlOf).filter(Boolean).slice(0, 4),
      element: null,
    });
  }
  const latency = audit(lhr, 'document-latency-insight');
  const checks = latency?.details?.checklist || latency?.details?.items || null;
  const failedChecks = checks && typeof checks === 'object' && !Array.isArray(checks) ? Object.values(checks).filter((c) => c && c.value === false) : [];
  for (const c of failedChecks) {
    items.push({ title: c.label || 'Document request check failed', value: null, valueLabel: null, cause: 'Document request', fix: /compress/i.test(c.label || '') ? 'Enable gzip or Brotli compression for HTML.' : /redirect/i.test(c.label || '') ? 'Remove redirects to the main document.' : 'Make the server respond faster: full-page cache, CDN edge caching, fewer database queries / apps on the page.', related: [], element: null });
  }
  const ttfb = lab?.ttfb?.value;
  if (typeof ttfb === 'number' && ttfb > 800 && !failedChecks.some((c) => /server|respond/i.test(c.label || ''))) {
    items.push({
      title: `Server took ${Math.round(ttfb)} ms to send the first byte`,
      value: ttfb,
      valueLabel: null,
      cause: 'Slow server response',
      fix: 'Serve cached HTML from a CDN edge, enable page caching, and reduce server-side work (apps, plugins, heavy Liquid/PHP loops).',
      related: [],
      element: null,
    });
  }
  return items;
}

// ---- TBT / INP -------------------------------------------------------------

function diagnoseTbt(lhr) {
  const items = [];
  for (const r of rows(audit(lhr, 'bootup-time'))) {
    const u = urlOf(r);
    const ms = r.scripting ?? r.total;
    if (!u || typeof ms !== 'number' || ms < 50) continue;
    items.push({
      title: u,
      value: ms,
      valueLabel: `${Math.round(ms)} ms script execution`,
      cause: 'Heavy JavaScript on the main thread',
      fix: 'Remove or delay this script until user interaction / idle time, load it with defer, or code-split it so less runs on page load.',
      related: [],
      element: null,
    });
  }
  const longTasks = rows(audit(lhr, 'long-tasks'));
  const byUrl = new Map();
  for (const t of longTasks) {
    const u = urlOf(t) || 'Unattributable';
    byUrl.set(u, (byUrl.get(u) || 0) + (t.duration || 0));
  }
  for (const [u, ms] of byUrl) {
    if (items.some((i) => i.title === u) || ms < 50) continue;
    items.push({ title: u, value: ms, valueLabel: `${Math.round(ms)} ms in long tasks`, cause: 'Long tasks (> 50 ms) block clicks and taps', fix: 'Break the work into smaller chunks (yield with setTimeout / scheduler.yield) or delay it until after load.', related: [], element: null });
  }
  return items.sort((x, y) => (y.value ?? 0) - (x.value ?? 0)).slice(0, 10);
}

export function diagnoseMetrics({ lhr, lab, field, lcp }) {
  const shot = pageShot(lhr);
  const fieldOnly = (k) => field?.metrics?.[k]?.rating && field.metrics[k].rating !== 'good';
  const clsItems = diagnoseCls(lhr, shot);
  return {
    screenshot: shot ? { kind: shot.kind, data: shot.data, width: shot.width, height: shot.height } : null,
    metrics: {
      cls: {
        items: clsItems,
        note:
          fieldOnly('cls') && !(lab?.cls?.value > 0.1)
            ? 'Real users see layout shifts that this single lab load did not reproduce. Field CLS also counts shifts while scrolling and after load – popups, sticky/announcement bars, lazy-loaded images and app widgets appearing later. Check the elements below and anything that appears after the page loads.'
            : null,
      },
      lcp: { items: diagnoseLcp(lhr, shot, lcp), note: null },
      fcp: { items: diagnoseFcp(lhr), note: null },
      ttfb: { items: diagnoseTtfb(lhr, lab), note: null },
      tbt: {
        items: diagnoseTbt(lhr),
        note: fieldOnly('inp') ? 'INP (real users) is slow: the scripts below keep the main thread busy, which delays the response to taps and clicks.' : null,
      },
    },
  };
}
