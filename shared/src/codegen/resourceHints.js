// Resource-hint planner: decides, from scan evidence, which resources should be
// preloaded, preconnected, prioritised (fetchpriority), loaded asynchronously or deferred,
// and generates an ordered <head> plus Shopify/WordPress equivalents.
//
// Principles (to avoid harmful advice):
// - Preload only resources the browser discovers late (CSS background LCP, @import, fonts,
//   JS-injected hero) – preloading something already in the HTML head gives no benefit.
// - At most one image preload (the LCP image) and 1–2 font preloads.
// - Preconnect at most 4 origins; use dns-prefetch for the rest.

import { fileName } from '../format.js';

const originOf = (u) => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function buildResourceHints(report) {
  const items = [];
  const css = report?.css?.files || [];
  const fonts = report?.css?.fonts || [];
  const js = report?.js?.files || [];
  const requests = report?.resources?.requests || [];
  const lcp = report?.lcp || {};
  const finalOrigin = originOf(report?.finalUrl);
  const importedUrls = new Set(css.flatMap((f) => (f.imports || []).map((i) => { try { return new URL(i, f.url).toString(); } catch { return i; } })));

  // ---------- Stylesheets
  const blocking = css.filter((f) => f.renderBlocking);
  // "Critical" = the render-blocking first-party sheet(s) that are mostly used on this page.
  const critical = new Set(
    blocking
      .filter((f) => !f.thirdParty && (f.unusedPercent == null || f.unusedPercent < 60))
      .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
      .slice(0, 2)
      .map((f) => f.url),
  );
  if (!critical.size && blocking.length) critical.add(blocking[0].url);

  for (const f of css) {
    const name = fileName(f.url).split('?')[0];
    const late = importedUrls.has(f.url) || (f.startMs != null && f.startMs > 1200 && !f.renderBlocking);
    if (/print/i.test(f.media || '') || /print\.css/i.test(name)) {
      items.push({ kind: 'css', url: f.url, action: 'media-print', label: 'Print-only stylesheet', priority: 'low', reason: 'Print styles should never block screen rendering.', tag: `<link rel="stylesheet" href="${esc(f.url)}" media="print">` });
    } else if (importedUrls.has(f.url)) {
      items.push({ kind: 'css', url: f.url, action: 'preload-high', label: 'Loaded via @import (late discovery)', priority: 'high', reason: 'Discovered only after its parent stylesheet downloads. Link it directly and preload it so it downloads in parallel.', tag: `<link rel="preload" href="${esc(f.url)}" as="style" fetchpriority="high">\n<link rel="stylesheet" href="${esc(f.url)}">` });
    } else if (f.renderBlocking && critical.has(f.url)) {
      items.push({ kind: 'css', url: f.url, action: 'keep-critical', label: 'Critical stylesheet', priority: 'medium', reason: `Styles the first viewport${f.unusedPercent != null ? ` (${Math.round(100 - f.unusedPercent)}% used)` : ''}. Keep it blocking (it already loads at the highest priority); inline the above-the-fold subset as critical CSS to remove the blocking round trip.`, tag: `<style>/* critical CSS extracted from ${esc(name)} */</style>\n<link rel="stylesheet" href="${esc(f.url)}">` });
    } else if (f.renderBlocking) {
      const why = f.thirdParty ? 'Third-party stylesheet blocking first paint.' : f.unusedPercent != null ? `${Math.round(f.unusedPercent)}% of it is unused on this page.` : 'Not needed for the first viewport.';
      items.push({ kind: 'css', url: f.url, action: 'async', label: 'Non-critical, render-blocking', priority: f.blockingMs > 300 ? 'high' : 'medium', reason: `${why} Load it asynchronously with low priority so it no longer blocks rendering.`, savingsMs: f.blockingMs || null, tag: `<link rel="preload" href="${esc(f.url)}" as="style" fetchpriority="low" onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="${esc(f.url)}"></noscript>` });
    } else if (late) {
      items.push({ kind: 'css', url: f.url, action: 'preload', label: 'Discovered late', priority: 'medium', reason: `Requested at ${Math.round(f.startMs)} ms. If it styles visible content, preload it; otherwise leave it.`, tag: `<link rel="preload" href="${esc(f.url)}" as="style">` });
    } else {
      items.push({ kind: 'css', url: f.url, action: 'ok', label: 'Non-blocking', priority: 'low', reason: 'Already loads without blocking rendering – no hint needed.', tag: null });
    }
  }

  // ---------- Fonts
  const fontsSorted = [...fonts].sort((a, b) => (a.startMs ?? 9e9) - (b.startMs ?? 9e9));
  const preloadFonts = fontsSorted.filter((f) => !f.preloaded && /woff2/.test(f.format || f.url)).slice(0, 2);
  for (const f of fontsSorted) {
    if (f.preloaded) {
      items.push({ kind: 'font', url: f.url, action: 'ok', label: 'Already preloaded', priority: 'low', reason: 'Make sure the preload has crossorigin and type="font/woff2", otherwise it is downloaded twice.', tag: `<link rel="preload" href="${esc(f.url)}" as="font" type="font/woff2" crossorigin>` });
    } else if (preloadFonts.includes(f)) {
      items.push({ kind: 'font', url: f.url, action: 'preload-high', label: 'Early text font', priority: 'high', reason: `Requested at ${f.startMs != null ? Math.round(f.startMs) + ' ms' : 'an unknown time'} – only after the CSS that references it is parsed. Preloading starts it with the HTML.`, tag: `<link rel="preload" href="${esc(f.url)}" as="font" type="font/woff2" crossorigin fetchpriority="high">` });
    } else if (!/woff2/.test(f.format || f.url)) {
      items.push({ kind: 'font', url: f.url, action: 'convert', label: `Legacy ${String(f.format || '').toUpperCase()} font`, priority: 'medium', reason: 'Convert to WOFF2 before considering a preload.', tag: null });
    } else {
      items.push({ kind: 'font', url: f.url, action: 'ok', label: 'Secondary font', priority: 'low', reason: 'Do not preload every font – only the 1–2 used above the fold.', tag: null });
    }
  }

  // ---------- LCP image
  if (lcp.imageUrl) {
    const already = lcp.checks?.preloaded;
    const needsPreload = lcp.checks?.cssBackground || lcp.checks?.discoverableInHtml === false;
    const hasPriority = lcp.checks?.fetchPriorityHigh;
    items.push({
      kind: 'image',
      url: lcp.imageUrl,
      action: needsPreload && !already ? 'preload-high' : hasPriority ? 'ok' : 'fetchpriority',
      label: 'LCP image',
      priority: needsPreload && !already ? 'critical' : hasPriority ? 'low' : 'high',
      reason: needsPreload && !already
        ? 'The LCP image is not discoverable in the HTML (CSS background or JS-inserted). Preload it with high priority.'
        : hasPriority
          ? 'Already has fetchpriority="high".'
          : 'The image is in the HTML, so a preload is not needed – add fetchpriority="high" (and loading="eager") to the <img> itself.',
      tag: needsPreload && !already
        ? `<link rel="preload" as="image" href="${esc(lcp.imageUrl)}" fetchpriority="high">`
        : `<img src="${esc(lcp.imageUrl)}" fetchpriority="high" loading="eager" decoding="async" …>`,
    });
  }

  // ---------- Scripts
  for (const f of js.filter((x) => x.renderBlocking).slice(0, 10)) {
    items.push({ kind: 'js', url: f.url, action: f.thirdParty ? 'async' : 'defer', label: f.thirdParty ? 'Blocking third-party script' : 'Blocking script', priority: 'high', reason: f.thirdParty ? 'Independent third-party tag – async lets the parser continue.' : 'defer keeps execution order but runs after HTML parsing.', savingsMs: f.blockingMs || null, tag: `<script src="${esc(f.url)}" ${f.thirdParty ? 'async' : 'defer'}></script>` });
  }
  for (const f of js.filter((x) => !x.renderBlocking && x.thirdParty && (x.transferSize || 0) > 50_000).slice(0, 5)) {
    items.push({ kind: 'js', url: f.url, action: 'fetchpriority-low', label: 'Large non-critical third-party script', priority: 'medium', reason: 'Lower its network priority so it does not compete with the LCP image and fonts (or delay it until interaction).', tag: `<script src="${esc(f.url)}" async fetchpriority="low"></script>` });
  }

  // ---------- Origins (preconnect / dns-prefetch)
  const early = new Map();
  for (const r of requests) {
    const o = originOf(r.url);
    if (!o || o === finalOrigin || !r.thirdParty) continue;
    const critical = ['css', 'font'].includes(r.type) || (lcp.imageUrl && originOf(lcp.imageUrl) === o);
    const e = early.get(o) || { origin: o, first: r.startMs ?? 9e9, critical: false, font: false, count: 0 };
    e.first = Math.min(e.first, r.startMs ?? 9e9);
    e.critical ||= critical && (r.startMs ?? 9e9) < 2500;
    e.font ||= r.type === 'font';
    e.count += 1;
    early.set(o, e);
  }
  const origins = [...early.values()].sort((a, b) => (b.critical - a.critical) || a.first - b.first);
  const preconnect = origins.filter((o) => o.critical).slice(0, 4);
  const prefetch = origins.filter((o) => !preconnect.includes(o)).slice(0, 8);
  for (const o of preconnect) {
    items.push({ kind: 'origin', url: o.origin, action: 'preconnect', label: o.font ? 'Font origin' : 'Critical third-party origin', priority: 'medium', reason: `Serves render-critical resources (first request at ${Math.round(o.first)} ms). Preconnect saves DNS + TCP + TLS.`, tag: `<link rel="preconnect" href="${esc(o.origin)}"${o.font ? ' crossorigin' : ''}>` });
  }
  for (const o of prefetch) {
    items.push({ kind: 'origin', url: o.origin, action: 'dns-prefetch', label: 'Other third-party origin', priority: 'low', reason: `${o.count} request(s), not render-critical – a cheap DNS lookup hint is enough.`, tag: `<link rel="dns-prefetch" href="${esc(o.origin)}">` });
  }

  // ---------- Ordered <head>
  const tags = (pred) => items.filter(pred).map((i) => i.tag).filter(Boolean);
  const sections = [
    ['Connection hints (max 4 preconnect)', tags((i) => i.action === 'preconnect' || i.action === 'dns-prefetch')],
    ['LCP image (only when not discoverable in the HTML)', tags((i) => i.kind === 'image' && i.action === 'preload-high')],
    ['Critical fonts', tags((i) => i.kind === 'font' && i.action === 'preload-high')],
    ['Critical CSS inline + critical stylesheet(s)', tags((i) => i.kind === 'css' && ['keep-critical', 'preload-high', 'preload'].includes(i.action))],
    ['Non-critical CSS, loaded asynchronously', tags((i) => i.kind === 'css' && ['async', 'media-print'].includes(i.action))],
    ['Scripts: defer / async', tags((i) => i.kind === 'js')],
  ].filter(([, t]) => t.length);
  const indent = (t) => t.split('\n').map((x) => `  ${x}`).join('\n');
  const head = [
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>…</title>',
    ...sections.flatMap(([title, t], n) => ['', `  <!-- ${n + 1}. ${title} -->`, ...t.map(indent)]),
    '</head>',
  ].join('\n');

  const asyncCss = items.filter((i) => i.kind === 'css' && i.action === 'async');
  const shopify = [
    "{%- comment -%} layout/theme.liquid – inside <head>, before {{ content_for_header }} {%- endcomment -%}",
    ...items.filter((i) => i.action === 'preconnect').map((i) => i.tag),
    ...items.filter((i) => i.kind === 'font' && i.action === 'preload-high').map((i) => i.tag),
    "{%- comment -%} Theme fonts: preload the body font {%- endcomment -%}",
    "<link rel=\"preload\" as=\"font\" href=\"{{ settings.type_body_font | font_url }}\" type=\"font/woff2\" crossorigin>",
    '',
    "{%- comment -%} Critical stylesheet stays blocking {%- endcomment -%}",
    "{{ 'base.css' | asset_url | stylesheet_tag }}",
    '',
    "{%- comment -%} Non-critical stylesheets load asynchronously {%- endcomment -%}",
    ...(asyncCss.length ? asyncCss : [{ url: 'component-example.css' }]).map((i) => {
      const n = fileName(i.url).split('?')[0];
      return `<link rel="stylesheet" href="{{ '${n}' | asset_url }}" media="print" onload="this.media='all'">\n<noscript>{{ '${n}' | asset_url | stylesheet_tag }}</noscript>`;
    }),
    '',
    "{%- comment -%} Hero/LCP image: use image_tag with preload: true and fetchpriority: 'high' in the first section {%- endcomment -%}",
  ].join('\n');

  const wordpress = `<?php
/**
 * SpeedLab Pro – resource hints generated from your scan.
 * Add to your child theme's functions.php (or a code-snippets plugin).
 */
add_filter( 'wp_resource_hints', function ( $urls, $relation ) {
	if ( 'preconnect' === $relation ) {
${items.filter((i) => i.action === 'preconnect').map((i) => `\t\t$urls[] = array( 'href' => '${i.url}'${/crossorigin/.test(i.tag) ? ", 'crossorigin' => 'anonymous'" : ''} );`).join('\n') || '\t\t// no critical third-party origins found'}
	}
	if ( 'dns-prefetch' === $relation ) {
${items.filter((i) => i.action === 'dns-prefetch').map((i) => `\t\t$urls[] = '${i.url}';`).join('\n') || '\t\t// none'}
	}
	return $urls;
}, 10, 2 );

add_action( 'wp_head', function () {
${[...items.filter((i) => (i.kind === 'font' || i.kind === 'image') && i.action === 'preload-high')].map((i) => `\techo '${i.tag.replace(/'/g, "\\'")}' . "\\n";`).join('\n') || '\t// no font/LCP preloads needed'}
}, 1 );

// Load non-critical stylesheets asynchronously (replace with your style handles).
add_filter( 'style_loader_tag', function ( $html, $handle ) {
	$async = array( /* ${asyncCss.map((i) => fileName(i.url).split('?')[0]).join(', ') || 'handle-names'} */ );
	if ( in_array( $handle, $async, true ) ) {
		$html = str_replace( "media='all'", "media='print' onload=\\"this.media='all'\\"", $html );
	}
	return $html;
}, 10, 2 );`;

  const counts = items.reduce((a, i) => ({ ...a, [i.action]: (a[i.action] || 0) + 1 }), {});
  return { items, head, shopify, wordpress, counts, existingPreloads: null };
}
