// Decides, per image, whether it should be preloaded, prioritised, loaded eagerly or lazily.
// Rules (kept conservative so they never make things worse):
//  - Preload only the LCP image, and only when the browser cannot discover it early
//    (CSS background, injected by JavaScript, or lazy-load library). Max 1 image preload.
//  - fetchpriority="high" on exactly one image: the LCP image.
//  - Other above-the-fold images: loading="eager", no priority hint.
//  - Everything below the fold: loading="lazy" decoding="async".

import { setAttrs, prettyTag } from './html.js';
import { fileName } from '../format.js';

export const PRIORITY_ACTIONS = {
  preload: { label: 'Preload + fetchpriority="high"', tone: 'red', order: 0 },
  high: { label: 'fetchpriority="high" (no preload needed)', tone: 'orange', order: 1 },
  eager: { label: 'Eager (keep as is)', tone: 'green', order: 2 },
  lazy: { label: 'Lazy-load', tone: 'blue', order: 3 },
  unknown: { label: 'Position unknown', tone: 'slate', order: 4 },
};

export function imagePriorityPlan(report) {
  const images = report?.images?.images || [];
  const lcp = report?.lcp || {};
  const inspected = !!report?.sources?.pageInspection;
  const lateDiscovery = !!(lcp.checks?.cssBackground || lcp.checks?.discoverableInHtml === false || lcp.checks?.jsDelaysDiscovery || lcp.checks?.lazyLoaded);
  const rows = [];

  const lcpImg = lcp.imageUrl ? images.find((i) => i.isLcp) || { url: lcp.imageUrl, isLcp: true, isBackground: lcp.checks?.cssBackground, natural: lcp.image?.natural, rendered: lcp.image?.rendered, attrs: lcp.image?.attrs || {}, snippet: lcp.element?.snippet, format: lcp.image?.format, transferSize: lcp.image?.transferSize, aboveFold: true } : null;

  if (lcpImg) {
    const action = lateDiscovery || lcpImg.isBackground ? 'preload' : 'high';
    const reasons = [];
    if (lcpImg.isBackground) reasons.push('It is a CSS background image, so the browser only finds it after downloading the CSS.');
    if (lcp.checks?.discoverableInHtml === false) reasons.push('Its URL is not in the initial HTML (added later by JavaScript).');
    if (lcp.checks?.lazyLoaded) reasons.push('It is lazy-loaded – remove loading="lazy" first.');
    if (action === 'high') reasons.push('It is already in the HTML, so a preload adds nothing – a priority hint on the <img> is enough.');
    if (lcp.checks?.fetchPriorityHigh) reasons.push('fetchpriority="high" is already set ✓');
    rows.push({ img: lcpImg, action, done: action === 'high' && lcp.checks?.fetchPriorityHigh && !lcp.checks?.lazyLoaded, reason: `This is the LCP (largest) image. ${reasons.join(' ')}` });
  }

  for (const img of images) {
    if (lcpImg && img.isLcp) continue;
    if (img.format === 'svg' && (img.transferSize || 0) < 5000) continue;
    if (img.aboveFold === true) {
      const lazy = img.attrs?.loading === 'lazy';
      rows.push({ img, action: 'eager', done: !lazy, reason: lazy ? 'Visible in the first screen but lazy-loaded – remove loading="lazy". Do not preload it (only the LCP image should be prioritised).' : 'Visible in the first screen. Keep it eager; no preload or priority hint so it does not compete with the LCP image.' });
    } else if (img.aboveFold === false) {
      const lazy = img.attrs?.loading === 'lazy' || img.isBackground;
      rows.push({ img, action: 'lazy', done: lazy, reason: img.isBackground ? 'Below-the-fold CSS background – browsers only load it when the element renders; no change needed.' : lazy ? 'Below the fold and already lazy-loaded ✓' : 'Below the fold – lazy-load it so it does not take bandwidth from the first screen.' });
    } else if ((img.transferSize || 0) > 20_000) {
      rows.push({ img, action: 'unknown', done: false, reason: 'Position on the page is unknown in this scan (Lite mode). Lazy-load it if it is below the first screen.' });
    }
  }
  rows.sort((a, b) => PRIORITY_ACTIONS[a.action].order - PRIORITY_ACTIONS[b.action].order || (b.img.transferSize || 0) - (a.img.transferSize || 0));

  // ---- Code
  const pre = rows.find((r) => r.action === 'preload');
  const high = rows.find((r) => r.action === 'high' || r.action === 'preload');
  // Use only URLs that really exist: the page's own srcset/sizes if present, otherwise the plain src.
  const preloadFor = (img) => {
    const srcset = img.attrs?.srcset;
    const attrs = [['rel', 'preload'], ['as', 'image'], ['href', img.url]];
    if (srcset && !img.isBackground) {
      attrs.push(['imagesrcset', srcset]);
      attrs.push(['imagesizes', img.attrs?.sizes || '100vw']);
    }
    attrs.push(['fetchpriority', 'high']);
    return prettyTag(`<link ${attrs.map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}>`);
  };
  const headCode = pre
    ? `<!-- In <head>, before stylesheets: preload ONLY the LCP image -->\n${preloadFor(pre.img)}`
    : high
      ? '<!-- No preload needed: the LCP image is already discoverable in the HTML. -->'
      : '<!-- No LCP image detected for this page. -->';
  const tag = (r, changes) => {
    const before = r.img.snippet && /^<img/i.test(r.img.snippet) ? r.img.snippet.match(/^<img[^>]*>/i)[0] : `<img src="${r.img.url}" alt="">`;
    return { before, after: prettyTag(setAttrs(before, changes)) };
  };
  const imgCode = [];
  if (high && !high.img.isBackground) imgCode.push({ title: `LCP image – ${fileName(high.img.url)}`, ...tag(high, { loading: 'eager', fetchpriority: 'high', decoding: null, 'data-src': null }) });
  for (const r of rows.filter((x) => x.action === 'eager' && !x.done).slice(0, 4)) imgCode.push({ title: `Above the fold – ${fileName(r.img.url)}`, ...tag(r, { loading: 'eager', fetchpriority: null }) });
  for (const r of rows.filter((x) => x.action === 'lazy' && !x.done).slice(0, 6)) imgCode.push({ title: `Below the fold – ${fileName(r.img.url)}`, ...tag(r, { loading: 'lazy', decoding: 'async', fetchpriority: null }) });

  const lcpUrl = (pre || high)?.img.url;
  const shopify = `{%- comment -%} Hero / first section: prioritise the LCP image, lazy-load the rest {%- endcomment -%}
{%- if section.index == 1 -%}
  {{ section.settings.image | image_url: width: 1920 | image_tag: loading: 'eager', fetchpriority: 'high', preload: ${pre ? 'true' : 'false'}, widths: '480, 750, 1100, 1500, 1920', sizes: '100vw' }}
{%- else -%}
  {{ section.settings.image | image_url: width: 1500 | image_tag: loading: 'lazy', decoding: 'async', widths: '480, 750, 1100, 1500', sizes: '100vw' }}
{%- endif -%}
${pre ? "\n{%- comment -%} preload: true makes Shopify send a Link: rel=preload header – use it only on the hero image. {%- endcomment -%}" : ''}`;
  const wordpress = `<?php
// Prioritise the LCP image and lazy-load the rest (WordPress 6.3+ does part of this automatically).
${lcpUrl ? `add_filter( 'wp_get_attachment_image_attributes', function ( $attr ) {
	if ( isset( $attr['src'] ) && false !== strpos( $attr['src'], '${fileName(lcpUrl).replace(/-\d+x\d+(?=\.)/, '').replace(/\.[a-z0-9]+$/i, '').replace(/'/g, '')}' ) ) {
		$attr['loading']       = 'eager';
		$attr['fetchpriority'] = 'high';
	}
	return $attr;
}, 20 );
` : ''}${pre ? `
add_action( 'wp_head', function () {
	if ( is_front_page() ) {
		echo '<link rel="preload" as="image" href="${pre.img.url.replace(/'/g, '')}" fetchpriority="high">' . "\\n";
	}
}, 1 );
` : ''}
// Keep the first ${Math.max(1, rows.filter((r) => ['preload', 'high', 'eager'].includes(r.action)).length)} image(s) eager; lazy-load the rest.
add_filter( 'wp_omit_loading_attr_threshold', function () {
	return ${Math.max(1, rows.filter((r) => ['preload', 'high', 'eager'].includes(r.action)).length)};
} );`;

  return {
    rows,
    inspected,
    counts: Object.fromEntries(Object.keys(PRIORITY_ACTIONS).map((k) => [k, rows.filter((r) => r.action === k).length])),
    headCode,
    imgCode,
    shopify,
    wordpress,
  };
}
