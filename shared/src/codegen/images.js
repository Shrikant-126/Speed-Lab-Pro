// Image markup generators: optimised <img>/<picture>, preload tags, Shopify Liquid and WordPress PHP.

import { parseTag, getAttr, setAttrs, buildTag, prettyTag, widthLadder, variantUrl, isCdnResizable } from './html.js';
import { fileName } from '../format.js';

const IMG_ORDER = ['src', 'srcset', 'sizes', 'width', 'height', 'alt', 'loading', 'decoding', 'fetchpriority', 'class', 'style'];

function sizesFor(img, viewportW = 412) {
  const rw = img.rendered?.w;
  if (!rw) return '100vw';
  const vw = Math.round((rw / viewportW) * 100);
  if (vw >= 90) return '100vw';
  return `(min-width: 990px) ${Math.min(100, Math.round(vw * 0.6))}vw, ${Math.min(100, vw)}vw`;
}

/**
 * Generate an optimised <img> or <picture> for one analysed image.
 * @param {object} img  analysed image (from report.images.images or issue evidence)
 * @param {{ lcp?: boolean, viewportW?: number, modern?: boolean }} opts
 */
export function optimizedImageMarkup(img, opts = {}) {
  const lcp = opts.lcp ?? img.isLcp;
  const viewportW = opts.viewportW || 412;
  const original = img.snippet && /^<img/i.test(img.snippet) ? img.snippet.match(/^<img[^>]*>/i)[0] : null;
  const parsed = parseTag(original);
  const src = img.url;
  const natural = img.natural || {};
  const rendered = img.rendered || {};
  const width = getAttr(parsed, 'width') || natural.w || rendered.w || null;
  const height = getAttr(parsed, 'height') || (natural.w && natural.h && width ? Math.round((natural.h / natural.w) * width) : rendered.h || null);
  const ladder = widthLadder(rendered.w || natural.w || 800, natural.w);
  const fmt = img.format === 'png' ? 'png' : 'jpeg';
  const resizable = isCdnResizable(src);
  const srcset = ladder.map((w) => `${variantUrl(src, w, resizable ? null : fmt === 'jpeg' ? 'jpg' : fmt)} ${w}w`).join(', ');
  const sizes = getAttr(parsed, 'sizes') || sizesFor(img, viewportW);
  const alt = getAttr(parsed, 'alt') ?? img.attrs?.alt ?? '';

  const changes = {
    src: getAttr(parsed, 'src') || src,
    srcset: getAttr(parsed, 'srcset') || srcset,
    sizes,
    width: width ? String(width) : null,
    height: height ? String(height) : null,
    alt,
    loading: lcp || img.aboveFold ? 'eager' : 'lazy',
    decoding: lcp ? null : 'async',
    fetchpriority: lcp ? 'high' : null,
    'data-src': null,
    'data-srcset': null,
  };
  const imgTag = parsed ? setAttrs(original, changes, { order: IMG_ORDER }) : buildTag('img', Object.entries(changes).filter(([, v]) => v !== null && v !== undefined), false);

  const needsModern = opts.modern ?? ['jpeg', 'png', 'gif'].includes(img.format);
  if (!needsModern || resizable) {
    return { before: original || `<img src="${src}">`, after: prettyTag(imgTag), resizable };
  }
  const avif = ladder.map((w) => `${variantUrl(src, w, 'avif')} ${w}w`).join(', ');
  const webp = ladder.map((w) => `${variantUrl(src, w, 'webp')} ${w}w`).join(', ');
  const picture = [
    '<picture>',
    `  <source type="image/avif" srcset="${avif}" sizes="${sizes}">`,
    `  <source type="image/webp" srcset="${webp}" sizes="${sizes}">`,
    prettyTag(imgTag, '  '),
    '</picture>',
  ].join('\n');
  return { before: original || `<img src="${src}">`, after: picture, resizable, variants: ladder };
}

export function preloadTag(img, viewportW) {
  const ladder = widthLadder(img.rendered?.w || img.natural?.w || 800, img.natural?.w);
  const resizable = isCdnResizable(img.url);
  const fmt = resizable ? null : img.format === 'png' ? 'png' : 'jpg';
  const srcset = ladder.map((w) => `${variantUrl(img.url, w, fmt)} ${w}w`).join(', ');
  return prettyTag(
    buildTag('link', [
      ['rel', 'preload'],
      ['as', 'image'],
      ['href', img.url],
      ['imagesrcset', srcset],
      ['imagesizes', sizesFor(img, viewportW)],
      ['fetchpriority', 'high'],
    ]),
  );
}

export function shopifyImageLiquid(img, { lcp, settingName = 'section.settings.image' } = {}) {
  const ladder = widthLadder(img.rendered?.w || 800, img.natural?.w).join(', ');
  const max = Math.min(img.natural?.w || 2000, 3840);
  const sizes = sizesFor(img);
  if (lcp) {
    return `{%- comment -%} LCP / hero image: eager, high priority, preloaded via Link header {%- endcomment -%}
{%- if section.index == 1 -%}
  {%- assign loading = 'eager' -%}
  {%- assign fetchpriority = 'high' -%}
  {%- assign preload = true -%}
{%- else -%}
  {%- assign loading = 'lazy' -%}
  {%- assign fetchpriority = 'auto' -%}
  {%- assign preload = false -%}
{%- endif -%}
{{
  ${settingName}
  | image_url: width: ${max}
  | image_tag:
    widths: '${ladder}',
    sizes: '${sizes}',
    loading: loading,
    fetchpriority: fetchpriority,
    preload: preload,
    alt: ${settingName}.alt | escape
}}`;
  }
  return `{{
  ${settingName}
  | image_url: width: ${max}
  | image_tag:
    widths: '${ladder}',
    sizes: '${sizes}',
    loading: 'lazy',
    decoding: 'async',
    alt: ${settingName}.alt | escape
}}`;
}

export function wordpressImagePhp(img, { lcp } = {}) {
  if (lcp) {
    return `<?php
/**
 * SpeedLab Pro – prioritise the LCP image (${fileName(img.url)}).
 * Add to your child theme's functions.php or a code-snippets plugin.
 * WordPress 6.3+ adds fetchpriority automatically to the first large content image;
 * this makes it explicit for hero images rendered by themes/builders.
 */
add_filter( 'wp_get_attachment_image_attributes', function ( $attr, $attachment ) {
	$hero_file = '${fileName(img.url).replace(/-\d+x\d+(?=\.)/, '').replace(/'/g, '')}';
	if ( isset( $attr['src'] ) && false !== strpos( $attr['src'], pathinfo( $hero_file, PATHINFO_FILENAME ) ) ) {
		$attr['loading']       = 'eager';
		$attr['fetchpriority'] = 'high';
		$attr['decoding']      = 'async';
	}
	return $attr;
}, 20, 2 );

// Preload the hero image on the front page only.
add_action( 'wp_head', function () {
	if ( ! is_front_page() ) {
		return;
	}
	echo '<link rel="preload" as="image" href="${img.url}" fetchpriority="high">' . "\\n";
}, 1 );`;
  }
  return `<?php
/**
 * SpeedLab Pro – lazy-load images that are not in the first viewport.
 * WordPress 5.5+ lazy-loads content images by default; this enforces it for theme images
 * rendered with wp_get_attachment_image() and skips the first image (likely above the fold).
 */
add_filter( 'wp_get_attachment_image_attributes', function ( $attr ) {
	static $count = 0;
	$count++;
	if ( $count > 2 && empty( $attr['fetchpriority'] ) ) {
		$attr['loading']  = 'lazy';
		$attr['decoding'] = 'async';
	}
	return $attr;
}, 20 );`;
}
