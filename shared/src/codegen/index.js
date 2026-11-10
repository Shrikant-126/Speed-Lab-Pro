// Code generator: produces copy-ready, evidence-based fixes for each issue type and target
// platform. Every snippet has { title, target, language, placement, before, after, notes }.
//
// Targets: html | css | js | shopify | wordpress | server

import { optimizedImageMarkup, preloadTag, shopifyImageLiquid, wordpressImagePhp } from './images.js';
import { setAttrs, prettyTag } from './html.js';
import { fileName, hostOf, formatBytes } from '../format.js';
import { wordpressEnvNotes } from './wordpress.js';

export const TARGETS = [
  { key: 'html', label: 'HTML' },
  { key: 'css', label: 'CSS' },
  { key: 'js', label: 'JavaScript' },
  { key: 'shopify', label: 'Shopify Liquid' },
  { key: 'wordpress', label: 'WordPress' },
  { key: 'server', label: 'Server / CLI' },
];

const S = (target, language, title, placement, before, after, notes = []) => ({ target, language, title, placement, before, after, notes });

const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
const name = (u) => fileName(u || '').split('?')[0];

// ---------------------------------------------------------------- LCP
function lcpImageFixes(issue, ctx) {
  const ev = issue.evidence || {};
  const img = { ...(ev.image || {}), url: ev.imageUrl || ev.image?.url, snippet: ev.snippet, isLcp: true, aboveFold: true };
  const out = [];
  if (!img.url) return out;
  const vw = ctx.viewportW;
  if (ev.isBackground) {
    out.push(S('html', 'html', 'Replace the CSS background hero with a real <img>', 'Hero section markup',
      `<div class="hero" style="background-image:url('${img.url}')">\n  …\n</div>`,
      `<div class="hero">\n${optimizedImageMarkup({ ...img, snippet: null }, { lcp: true, viewportW: vw }).after.replace(/^/gm, '  ')}\n  …\n</div>`,
      ['Position the <img> absolutely behind the hero content to keep the same design.']));
    out.push(S('css', 'css', 'Make the <img> behave like a cover background', 'Hero stylesheet', `.hero {\n  background-image: url('${name(img.url)}');\n  background-size: cover;\n}`,
      `.hero { position: relative; }\n.hero > img {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  z-index: -1;\n}`));
    out.push(S('html', 'html', 'Or keep the background and preload it', 'Inside <head>, before stylesheets', '<!-- no preload -->', preloadTag(img, vw)));
  } else {
    const m = optimizedImageMarkup(img, { lcp: true, viewportW: vw, modern: issue.type === 'lcp-format' });
    out.push(S('html', 'html', 'Optimised LCP image', 'Replace the LCP <img> in your template', m.before, m.after,
      [m.resizable ? 'Your image CDN supports width parameters, so the srcset URLs work as-is.' : 'Generate the resized/modern-format variants referenced in srcset (see Server / CLI tab), or use an image CDN.']));
    if (issue.type === 'lcp-preload' || ev.image?.attrs?.srcset === null) {
      out.push(S('html', 'html', 'Preload the LCP image', 'Inside <head>, before stylesheets and scripts', '<!-- no preload -->', preloadTag(img, vw),
        ['Only preload the single LCP image; preloading many images reduces the benefit.']));
    }
  }
  out.push(S('shopify', 'liquid', 'Shopify hero image (image_tag with priority and preload)', 'Hero/slideshow section, e.g. sections/image-banner.liquid (Dawn), the hero section in Horizon, or the slideshow section in Prestige/Empire/Symmetry',
    ev.snippet || "{{ section.settings.image | image_url: width: 3840 | image_tag: loading: 'lazy' }}",
    shopifyImageLiquid(img, { lcp: true }),
    ['section.index == 1 ensures only the first section on the page is prioritised.', 'preload: true makes Shopify send a Link: rel=preload header for the image.', 'If your hero is a slideshow, apply eager/high only to the first slide.']));
  out.push(S('wordpress', 'php', 'WordPress: prioritise and preload the hero image', 'Child theme functions.php or Code Snippets plugin', '// default theme output', wordpressImagePhp(img, { lcp: true }), wordpressEnvNotes(ctx.platform, 'lcp')));
  out.push(...imageCliFixes([img]));
  return out;
}

function imageCliFixes(images) {
  const list = images.filter((i) => i.url).slice(0, 5);
  if (!list.length) return [];
  const files = list.map((i) => name(i.url));
  const w = list[0].recommended?.width || Math.round((list[0].rendered?.w || 800) * 2);
  return [
    S('server', 'bash', 'Generate resized AVIF/WebP variants (Sharp CLI)', 'Run in your image source folder', `# originals: ${files.join(', ')}`,
      `npm i -g sharp-cli\n\n# Responsive widths in AVIF and WebP\nfor f in ${files.join(' ')}; do\n  for w in 480 768 1080 ${w}; do\n    sharp -i "$f" -o "\${f%.*}-\${w}w.avif" resize $w -- avif --quality 50\n    sharp -i "$f" -o "\${f%.*}-\${w}w.webp" resize $w -- webp --quality 75\n  done\ndone`,
      ['AVIF quality 45–55 and WebP 70–80 are visually close to JPEG 85.']),
  ];
}

// ---------------------------------------------------------------- Images
function imageGroupFixes(issue, ctx) {
  const imgs = issue.evidence?.images || [];
  const out = [];
  const sample = imgs.slice(0, 3);
  const vw = ctx.viewportW;
  switch (issue.type) {
    case 'img-lazy-missing':
      for (const i of sample) {
        const before = i.snippet?.match(/^<img[^>]*>/i)?.[0] || `<img src="${i.url}">`;
        out.push(S('html', 'html', `Lazy-load ${name(i.url)}`, i.selector || 'Image markup', before, prettyTag(setAttrs(before, { loading: 'lazy', decoding: 'async' }))));
      }
      out.push(S('shopify', 'liquid', 'Lazy-load section images in Shopify', 'Sections/snippets below the first section (e.g. snippets/card-product.liquid)', "{{ product.featured_media | image_url: width: 533 | image_tag }}",
        "{{ product.featured_media | image_url: width: 533 | image_tag: loading: 'lazy', decoding: 'async', widths: '165, 360, 533, 720, 940', sizes: '(min-width: 990px) 25vw, 50vw' }}"));
      out.push(S('wordpress', 'php', 'WordPress lazy-loading', 'functions.php', '', wordpressImagePhp({}, { lcp: false }), wordpressEnvNotes(ctx.platform, 'lazy')));
      break;
    case 'img-lazy-above-fold':
      for (const i of sample) {
        const before = i.snippet?.match(/^<img[^>]*>/i)?.[0] || `<img src="${i.url}" loading="lazy">`;
        out.push(S('html', 'html', `Load ${name(i.url)} eagerly`, i.selector || 'Image markup', before, prettyTag(setAttrs(before, { loading: 'eager', 'data-src': null, class: before.includes('lazyload') ? (before.match(/class="([^"]*)"/)?.[1] || '').replace(/\blazyload\b/, '').trim() || null : undefined }))));
      }
      out.push(S('shopify', 'liquid', 'Eager-load only the first section', 'Section liquid file', "image_tag: loading: 'lazy'", "{%- liquid\n  if section.index > 2\n    assign loading = 'lazy'\n  else\n    assign loading = 'eager'\n  endif\n-%}\n{{ section.settings.image | image_url: width: 1500 | image_tag: loading: loading }}"));
      out.push(S('wordpress', 'php', 'Exclude above-the-fold images from lazy loading', 'functions.php', '', `<?php\n// Do not lazy-load the first 2 content images (WordPress core filter, 5.9+)\nadd_filter( 'wp_omit_loading_attr_threshold', function () { return 2; } );`, wordpressEnvNotes(ctx.platform, 'lazy-exclude')));
      break;
    case 'img-dimensions':
    case 'img-cls':
      for (const i of sample) {
        const before = i.snippet?.match(/^<img[^>]*>/i)?.[0] || `<img src="${i.url}">`;
        const w = i.natural?.w || i.rendered?.w;
        const h = i.natural?.h || i.rendered?.h;
        out.push(S('html', 'html', `Add intrinsic size to ${name(i.url)}`, i.selector || 'Image markup', before,
          prettyTag(setAttrs(before, { width: w ? String(w) : '/* width */', height: h ? String(h) : '/* height */' })),
          [w && h ? `Intrinsic size measured: ${w}×${h}.` : 'Use the image file’s pixel dimensions.']));
      }
      out.push(S('css', 'css', 'Keep images responsive with width/height set', 'Global stylesheet', 'img { width: 100%; }', 'img {\n  max-width: 100%;\n  height: auto; /* keeps the aspect ratio from the width/height attributes */\n}\n\n/* For CSS background or unknown-size media, reserve space explicitly */\n.media-16x9 { aspect-ratio: 16 / 9; }'));
      out.push(S('shopify', 'liquid', 'Shopify image_tag adds width/height automatically', 'Any section/snippet', '<img src="{{ image | img_url: \'master\' }}">', "{{ image | image_url: width: 1000 | image_tag: loading: 'lazy' }}\n{%- comment -%} image_tag outputs width/height from the image's intrinsic size {%- endcomment -%}"));
      break;
    case 'img-srcset':
    case 'img-sizes':
    case 'img-oversized':
    case 'img-format':
    case 'img-compression':
      for (const i of sample) {
        const m = optimizedImageMarkup({ ...i }, { viewportW: vw, modern: issue.type === 'img-format' || ['jpeg', 'png'].includes(i.format) });
        const rec = i.recommended?.width ? ` → recommended ${i.recommended.width}×${i.recommended.height}px` : '';
        out.push(S('html', 'html', `${name(i.url)}${rec}`, i.selector || 'Image markup', m.before, m.after,
          [`Current: ${i.natural?.w || '?'}×${i.natural?.h || '?'}px, ${formatBytes(i.transferSize)}${i.rendered?.w ? `, displayed at ${i.rendered.w}×${i.rendered.h}px` : ''}.`]));
      }
      out.push(S('shopify', 'liquid', 'Responsive Shopify image (auto WebP/AVIF from Shopify CDN)', 'Section/snippet', "<img src=\"{{ image | img_url: 'master' }}\">", shopifyImageLiquid(sample[0] || {}, { lcp: false, settingName: 'image' }),
        ['Shopify’s CDN automatically serves WebP/AVIF to supporting browsers when using image_url.', 'Replace the deprecated img_url filter with image_url everywhere.']));
      out.push(S('wordpress', 'php', 'WordPress responsive images & modern formats', 'functions.php', '', `<?php\n// WordPress 6.1+: generate WebP sub-sizes for uploaded JPEGs\nadd_filter( 'image_editor_output_format', function ( $formats ) {\n\t$formats['image/jpeg'] = 'image/webp';\n\treturn $formats;\n} );\n\n// Make sure themes output srcset/sizes (use wp_get_attachment_image instead of raw <img>)\n// echo wp_get_attachment_image( $attachment_id, 'large', false, array( 'sizes' => '(min-width: 990px) 50vw, 100vw' ) );`,
        [...wordpressEnvNotes(ctx.platform, 'images'), 'Existing uploads need regenerating (e.g. "Regenerate Thumbnails" plugin) after changing formats.']));
      out.push(...imageCliFixes(imgs));
      break;
    case 'img-gif':
      for (const i of sample) {
        out.push(S('html', 'html', `Replace animated GIF ${name(i.url)} with video`, i.selector || 'Markup', `<img src="${i.url}">`,
          `<video autoplay muted loop playsinline width="${i.natural?.w || ''}" height="${i.natural?.h || ''}" poster="${name(i.url).replace(/\.gif$/i, '.webp')}">\n  <source src="${name(i.url).replace(/\.gif$/i, '.webm')}" type="video/webm">\n  <source src="${name(i.url).replace(/\.gif$/i, '.mp4')}" type="video/mp4">\n</video>`));
      }
      out.push(S('server', 'bash', 'Convert GIF to MP4/WebM (ffmpeg)', 'Terminal', '', `ffmpeg -i input.gif -movflags +faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4\nffmpeg -i input.gif -c:v libvpx-vp9 -b:v 0 -crf 41 output.webm`));
      break;
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------- Video
function videoFixes(issue, ctx) {
  const v = first(issue.evidence?.videos) || {};
  const src = v.src || 'video.mp4';
  const base = name(src).replace(/\.[a-z0-9]+$/i, '');
  const poster = v.poster || `${base}-poster.webp`;
  const w = v.rendered?.w || 1280;
  const h = v.rendered?.h || 720;
  const before = v.snippet?.match(/^<video[^>]*>/i)?.[0] ? `${v.snippet.slice(0, 400)}` : `<video src="${src}" autoplay loop></video>`;
  const out = [];
  const lazyMarkup = `<video class="js-lazy-video" autoplay muted loop playsinline preload="none"\n       poster="${poster}" width="${w}" height="${h}">\n  <source data-src="${base}.webm" type="video/webm">\n  <source data-src="${src}" type="video/mp4">\n</video>`;
  const lazyJs = `// Load <video class="js-lazy-video"> sources only when they approach the viewport.
(function () {
  const videos = document.querySelectorAll('video.js-lazy-video');
  const saveData = navigator.connection && navigator.connection.saveData;
  if (!('IntersectionObserver' in window) || saveData) return; // keep poster only
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      video.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
      video.load();
      if (video.autoplay) video.play().catch(() => {});
      io.unobserve(video);
    }
  }, { rootMargin: '200px 0px' });
  videos.forEach((v) => io.observe(v));
})();`;
  const mobileJs = `// Background video only on wide screens with no data-saver; mobile users get the poster.
(function () {
  const mq = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
  const saveData = navigator.connection && navigator.connection.saveData;
  document.querySelectorAll('video.js-desktop-video').forEach((video) => {
    if (!mq.matches || saveData) return;
    video.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
    video.load();
    video.play().catch(() => {});
  });
})();`;

  switch (issue.type) {
    case 'video-poster':
    case 'video-lcp':
      out.push(S('html', 'html', 'Add an optimised poster and reserve space', v.selector || 'Video markup', before,
        `<video ${v.autoplay ? 'autoplay muted loop playsinline ' : 'controls '}preload="metadata"\n       poster="${poster}" width="${w}" height="${h}">\n  <source src="${base}.webm" type="video/webm">\n  <source src="${src}" type="video/mp4">\n</video>`));
      if (issue.type === 'video-lcp') out.push(S('html', 'html', 'Preload the poster (it is the LCP candidate)', '<head>', '', `<link rel="preload" as="image" href="${poster}" fetchpriority="high">`));
      out.push(S('server', 'bash', 'Generate a WebP poster from the first second (ffmpeg)', 'Terminal', '', `ffmpeg -ss 00:00:01 -i "${name(src)}" -frames:v 1 -vf "scale=${Math.min(w * 2, 1920)}:-2" -c:v libwebp -quality 72 "${base}-poster.webp"`));
      break;
    case 'video-lazy':
      out.push(S('html', 'html', 'Lazy video markup', v.selector || 'Video markup', before, lazyMarkup));
      out.push(S('js', 'javascript', 'IntersectionObserver video loader', 'Before </body> (or your main JS bundle)', '', lazyJs));
      break;
    case 'video-mobile':
      out.push(S('html', 'html', 'Desktop-only background video', v.selector || 'Hero video markup', before,
        `<video class="js-desktop-video hero__video" muted loop playsinline preload="none"\n       poster="${poster}" width="${w}" height="${h}" aria-hidden="true">\n  <source data-src="${base}.webm" type="video/webm">\n  <source data-src="${src}" type="video/mp4">\n</video>`));
      out.push(S('js', 'javascript', 'Attach sources only on large screens', 'Before </body>', '', mobileJs));
      out.push(S('css', 'css', 'Poster-sized box on every screen', 'Hero stylesheet', '', `.hero__video {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  aspect-ratio: ${w} / ${h};\n}`));
      break;
    case 'video-autoplay':
      out.push(S('html', 'html', 'Correct autoplay attributes', v.selector || 'Video markup', before,
        `<video autoplay muted loop playsinline preload="metadata" poster="${poster}" width="${w}" height="${h}">\n  <source src="${src}" type="video/mp4">\n</video>`, ['Browsers only allow autoplay when the video is muted; iOS also needs playsinline.']));
      break;
    case 'video-compress':
    case 'video-format':
      out.push(S('server', 'bash', 'Re-encode for the web (ffmpeg)', 'Terminal', `# ${name(src)} — ${formatBytes(v.bytes)}`,
        `# H.264 MP4 fallback (fast start, sized for display${v.isBackground ? ', audio removed for background video' : ''})\nffmpeg -i "${name(src)}" -c:v libx264 -crf 27 -preset slow -vf "scale='min(${Math.min(w * 2, 1920)},iw)':-2" -movflags +faststart ${v.isBackground ? '-an' : '-c:a aac -b:a 96k'} "${base}.mp4"\n\n# VP9 WebM (typically 30–50% smaller)\nffmpeg -i "${name(src)}" -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -vf "scale='min(${Math.min(w * 2, 1920)},iw)':-2" ${v.isBackground ? '-an' : '-c:a libopus -b:a 64k'} "${base}.webm"`));
      out.push(S('html', 'html', 'Offer WebM first, MP4 as fallback', v.selector || 'Video markup', before, `<video ${v.autoplay ? 'autoplay muted loop playsinline ' : 'controls '}preload="metadata" poster="${poster}" width="${w}" height="${h}">\n  <source src="${base}.webm" type="video/webm">\n  <source src="${base}.mp4" type="video/mp4">\n</video>`));
      break;
    default:
      break;
  }
  out.push(S('shopify', 'liquid', 'Shopify video with poster and lazy loading', 'Video section (e.g. sections/video.liquid)', "{{ section.settings.video | video_tag: autoplay: true, loop: true }}",
    `{{ section.settings.video\n  | video_tag:\n    image_size: '${Math.min(w * 2, 1920)}x',\n    autoplay: true,\n    loop: true,\n    muted: true,\n    playsinline: true,\n    preload: 'none',\n    controls: false\n}}`, ['video_tag automatically uses the video’s preview image as the poster.', 'For below-the-fold videos combine with the IntersectionObserver loader from the JavaScript tab.']));
  out.push(S('wordpress', 'php', 'WordPress: lightweight video output', 'Template or functions.php', '[video src="…" autoplay="on"]',
    `<?php\n// Disable preload for core [video] shortcode / block videos\nadd_filter( 'wp_video_shortcode', function ( $html ) {\n\treturn str_replace( 'preload="metadata"', 'preload="none"', $html );\n} );`, wordpressEnvNotes(ctx.platform, 'video')));
  return out;
}

// ---------------------------------------------------------------- CSS
function cssFixes(issue, ctx) {
  const files = issue.evidence?.files || [];
  const f = first(files) || {};
  const href = f.url || 'styles.css';
  const out = [];
  switch (issue.type) {
    case 'css-render-blocking':
    case 'css-critical':
      out.push(S('html', 'html', 'Inline critical CSS, load the rest asynchronously', '<head>',
        files.slice(0, 4).map((x) => `<link rel="stylesheet" href="${x.url}">`).join('\n'),
        `<style>\n  /* Critical above-the-fold CSS (generate with the Server / CLI tab) */\n</style>\n${files.slice(0, 4).map((x) => `<link rel="preload" href="${x.url}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="${x.url}"></noscript>`).join('\n')}`,
        ['Keep the stylesheet that styles the first viewport blocking if you cannot generate critical CSS — otherwise users see a flash of unstyled content.']));
      out.push(S('server', 'javascript', 'Generate critical CSS with Penthouse', 'Node script (npm i penthouse)', '', `import penthouse from 'penthouse';\nimport { writeFile } from 'node:fs/promises';\n\nconst cssString = await (await fetch('${href}')).text();\nconst critical = await penthouse({\n  url: '${ctx.url || 'https://example.com/'}',\n  cssString,\n  width: ${ctx.strategy === 'desktop' ? 1350 : 412},\n  height: ${ctx.strategy === 'desktop' ? 940 : 823},\n});\nawait writeFile('critical.css', critical);\nconsole.log('critical.css', critical.length, 'bytes');`));
      out.push(S('shopify', 'liquid', 'Async non-critical CSS in Shopify', 'layout/theme.liquid and section files', "{{ '" + name(href) + "' | asset_url | stylesheet_tag }}",
        `{%- comment -%} Critical: keep base.css blocking, load component CSS asynchronously {%- endcomment -%}\n<link rel="stylesheet" href="{{ '${name(href)}' | asset_url }}" media="print" onload="this.media='all'">\n<noscript>{{ '${name(href)}' | asset_url | stylesheet_tag }}</noscript>`,
        ['Dawn-based themes already use this pattern for component-*.css; move section-specific CSS into the section file that uses it.']));
      out.push(S('wordpress', 'php', 'WordPress: load a stylesheet asynchronously', 'functions.php', '', `<?php\nadd_filter( 'style_loader_tag', function ( $html, $handle ) {\n\t$async = array( 'your-style-handle' ); // handles of non-critical stylesheets\n\tif ( in_array( $handle, $async, true ) ) {\n\t\t$html = str_replace( \"media='all'\", \"media='print' onload=\\\"this.media='all'\\\"\", $html );\n\t}\n\treturn $html;\n}, 10, 2 );`, wordpressEnvNotes(ctx.platform, 'css')));
      break;
    case 'css-unused':
      out.push(S('server', 'javascript', 'Purge unused CSS at build time (PurgeCSS)', 'postcss.config.js', `/* ${files.slice(0, 3).map((x) => `${name(x.url)}: ${formatBytes(x.unusedBytes)} unused`).join(', ')} */`,
        `module.exports = {\n  plugins: [\n    require('@fullhuman/postcss-purgecss')({\n      content: ['./templates/**/*.{html,liquid,php,twig}', './src/**/*.{js,jsx,ts,tsx,vue}'],\n      safelist: { standard: [/^is-/, /^has-/, /^js-/], deep: [/swiper/, /modal/] },\n      defaultExtractor: (c) => c.match(/[\\w-/:%.]+(?<!:)/g) || [],\n    }),\n    require('cssnano')({ preset: 'default' }),\n  ],\n};`, ['Always safelist classes added by JavaScript (sliders, modals, state classes) and test every template.']));
      out.push(S('html', 'html', 'Load page-specific CSS only where needed', 'Templates', `<link rel="stylesheet" href="${href}">  <!-- on every page -->`,
        `<!-- global, small --> <link rel="stylesheet" href="base.css">\n<!-- only on product pages --> <link rel="stylesheet" href="product.css" media="print" onload="this.media='all'">`));
      out.push(S('shopify', 'liquid', 'Move section CSS into the section', 'sections/<section>.liquid', "{{ 'section-x.css' | asset_url | stylesheet_tag }} in theme.liquid", "{%- comment -%} At the top of the section that uses it {%- endcomment -%}\n{{ 'section-x.css' | asset_url | stylesheet_tag }}"));
      out.push(S('wordpress', 'php', 'Dequeue plugin CSS where it is not used', 'functions.php', '', `<?php\nadd_action( 'wp_enqueue_scripts', function () {\n\t// Example: contact form CSS only on the contact page\n\tif ( ! is_page( 'contact' ) ) {\n\t\twp_dequeue_style( 'contact-form-7' );\n\t}\n\t// Example: WooCommerce styles only on shop pages\n\tif ( function_exists( 'is_woocommerce' ) && ! is_woocommerce() && ! is_cart() && ! is_checkout() ) {\n\t\twp_dequeue_style( 'woocommerce-general' );\n\t\twp_dequeue_style( 'woocommerce-layout' );\n\t\twp_dequeue_style( 'woocommerce-smallscreen' );\n\t}\n}, 99 );`, wordpressEnvNotes(ctx.platform, 'unused-css')));
      break;
    case 'css-minify':
    case 'css-large':
    case 'css-selectors':
    case 'css-duplicate':
      out.push(S('server', 'bash', 'Minify and analyse CSS', 'Terminal / build step', '', `npx lightningcss --minify --bundle --targets '>= 0.25%' ${name(href)} -o ${name(href).replace(/\.css$/, '.min.css')}\n\n# Inspect selector counts and duplicates\nnpx css-analyzer ${name(href)}  # or use https://www.projectwallace.com/analyze-css`));
      out.push(S('wordpress', 'text', 'WordPress minification', 'Plugin settings', '', wordpressEnvNotes(ctx.platform, 'minify').join('\n') || 'Enable CSS minification in your caching plugin.'));
      break;
    case 'css-import':
      out.push(S('css', 'css', 'Remove @import chains', name(href), (f.imports || ['other.css']).map((i) => `@import url("${i}");`).join('\n'), '/* @import removed – the file is now linked directly from the HTML */'));
      out.push(S('html', 'html', 'Link the imported files directly', '<head>', `<link rel="stylesheet" href="${href}">`, [...(f.imports || ['other.css']), href].map((u) => `<link rel="stylesheet" href="${u}">`).join('\n')));
      break;
    case 'font-display':
    case 'font-preload':
    case 'font-format':
    case 'font-google': {
      const fonts = issue.evidence?.fonts || [];
      const fnt = first(fonts)?.url || 'fonts/brand.woff2';
      out.push(S('css', 'css', 'font-display: swap with WOFF2', 'Stylesheet containing @font-face', `@font-face {\n  font-family: "Brand";\n  src: url("${name(fnt)}") format("${/woff2/.test(fnt) ? 'woff2' : 'truetype'}");\n}`,
        `@font-face {\n  font-family: "Brand";\n  src: url("${name(fnt).replace(/\.(ttf|otf|woff|eot)$/i, '.woff2')}") format("woff2");\n  font-display: swap;\n}\n\n/* Size-adjusted fallback to minimise layout shift when the font swaps */\n@font-face {\n  font-family: "Brand Fallback";\n  src: local("Arial");\n  size-adjust: 104%;\n  ascent-override: 92%;\n}\nbody { font-family: "Brand", "Brand Fallback", sans-serif; }`, ['Tune size-adjust/ascent-override to match your font (e.g. with the "fontaine" or "capsize" tools).']));
      out.push(S('html', 'html', 'Preload the primary font and preconnect', '<head>', '<!-- none -->',
        `${issue.type === 'font-google' ? '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">\n' : ''}<link rel="preload" href="${fnt}" as="font" type="font/woff2" crossorigin>`, ['Preload at most 1–2 fonts used above the fold.']));
      out.push(S('shopify', 'liquid', 'Shopify font loading', 'layout/theme.liquid <head>', "{{ settings.type_body_font | font_face }}",
        "<link rel=\"preconnect\" href=\"https://fonts.shopifycdn.com\" crossorigin>\n<link rel=\"preload\" as=\"font\" href=\"{{ settings.type_body_font | font_url }}\" type=\"font/woff2\" crossorigin>\n<style>\n  {{ settings.type_body_font | font_face: font_display: 'swap' }}\n</style>"));
      out.push(S('wordpress', 'php', 'WordPress: font-display and preload', 'functions.php', '', `<?php\n// Add display=swap to Google Fonts enqueued by themes/plugins\nadd_filter( 'style_loader_src', function ( $src ) {\n\tif ( false !== strpos( $src, 'fonts.googleapis.com' ) && false === strpos( $src, 'display=' ) ) {\n\t\t$src = add_query_arg( 'display', 'swap', $src );\n\t}\n\treturn $src;\n} );\n\nadd_action( 'wp_head', function () {\n\techo '<link rel=\"preload\" href=\"${fnt}\" as=\"font\" type=\"font/woff2\" crossorigin>' . \"\\n\";\n}, 2 );`, wordpressEnvNotes(ctx.platform, 'fonts')));
      break;
    }
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------- JavaScript
const delayLoader = (urls) => `<!-- Delay non-critical scripts until the first interaction (or 5 s after load) -->
<script>
(function () {
  var scripts = ${JSON.stringify(urls.length ? urls : ['https://example.com/widget.js'], null, 2).replace(/\n/g, '\n  ')};
  var events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
  var done = false;
  function load() {
    if (done) return;
    done = true;
    events.forEach(function (e) { window.removeEventListener(e, load, { passive: true }); });
    scripts.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    });
    // Run inline snippets that were marked with type="text/plain" data-delay
    document.querySelectorAll('script[type="text/plain"][data-delay]').forEach(function (old) {
      var s = document.createElement('script');
      s.text = old.textContent;
      old.replaceWith(s);
    });
  }
  events.forEach(function (e) { window.addEventListener(e, load, { once: true, passive: true }); });
  window.addEventListener('load', function () { setTimeout(load, 5000); });
})();
</script>`;

function jsFixes(issue, ctx) {
  const files = issue.evidence?.files || [];
  const out = [];
  switch (issue.type) {
    case 'js-render-blocking': {
      const list = files.slice(0, 5);
      out.push(S('html', 'html', 'Defer render-blocking scripts', '<head>', list.map((f) => `<script src="${f.url}"></script>`).join('\n'),
        list.map((f) => `<script src="${f.url}" ${f.thirdParty ? 'async' : 'defer'}></script>`).join('\n'),
        ['defer keeps execution order and runs after parsing; use it for your own scripts and libraries.', 'async runs as soon as downloaded (order not guaranteed) – suitable for independent third-party tags.', 'Inline scripts that call a deferred library (e.g. jQuery(...)) must also run after it: wrap them in document.addEventListener("DOMContentLoaded", …).']));
      out.push(S('shopify', 'liquid', 'Defer theme scripts', 'layout/theme.liquid', list.length ? `<script src="{{ '${name(list[0].url)}' | asset_url }}"></script>` : '', `<script src="{{ '${name(list[0]?.url || 'global.js')}' | asset_url }}" defer="defer"></script>`, ['Scripts injected by apps through {{ content_for_header }} cannot be edited in the theme; disable unused app embeds instead (Online Store → Themes → Customize → App embeds).']));
      out.push(S('wordpress', 'php', 'Defer scripts in WordPress (6.3+ loading strategies)', 'functions.php', "wp_enqueue_script( 'my-script', $src, array(), '1.0' );",
        `<?php\n// Your own scripts\nwp_enqueue_script( 'my-script', $src, array(), '1.0', array( 'strategy' => 'defer', 'in_footer' => true ) );\n\n// Scripts registered by themes/plugins\nadd_action( 'wp_enqueue_scripts', function () {\n\tforeach ( array( 'plugin-script-handle' ) as $handle ) {\n\t\twp_script_add_data( $handle, 'strategy', 'defer' );\n\t}\n}, 100 );`, wordpressEnvNotes(ctx.platform, 'defer')));
      break;
    }
    case 'js-unused':
    case 'js-execution': {
      const f = first(files) || {};
      out.push(S('js', 'javascript', 'Code-split with dynamic import()', 'Your application entry', `import { initCarousel } from './carousel.js';\nimport { initReviews } from './reviews.js';\n\ninitCarousel();\ninitReviews();`,
        `// Load feature code only when the feature is on the page / in view\nconst lazyInit = (selector, loader) => {\n  const el = document.querySelector(selector);\n  if (!el) return;\n  const io = new IntersectionObserver(async ([entry]) => {\n    if (!entry.isIntersecting) return;\n    io.disconnect();\n    const mod = await loader();\n    mod.init(el);\n  }, { rootMargin: '300px' });\n  io.observe(el);\n};\n\nlazyInit('.carousel', () => import('./carousel.js'));\nlazyInit('#reviews', () => import('./reviews.js'));`, [`Largest offender: ${name(f.url)}${f.unusedBytes ? ` (${formatBytes(f.unusedBytes)} unused)` : f.bootupMs ? ` (${Math.round(f.bootupMs)} ms execution)` : ''}.`]));
      out.push(S('server', 'javascript', 'Bundler settings for tree shaking & splitting (Vite/Rollup)', 'vite.config.js', '', `export default {\n  build: {\n    target: 'es2020',          // no legacy transpilation for modern browsers\n    cssCodeSplit: true,\n    rollupOptions: {\n      output: {\n        manualChunks: { vendor: ['react', 'react-dom'] },\n      },\n    },\n  },\n};\n// Import only what you use: import debounce from 'lodash-es/debounce' (not the whole lodash)`));
      if (files.some((x) => x.thirdParty)) out.push(S('html', 'html', 'Delay third-party scripts until interaction', 'Before </body>', files.filter((x) => x.thirdParty).slice(0, 3).map((x) => `<script src="${x.url}" async></script>`).join('\n'), delayLoader(files.filter((x) => x.thirdParty).slice(0, 5).map((x) => x.url))));
      out.push(S('wordpress', 'text', 'WordPress: delay JavaScript', 'Plugin settings', '', wordpressEnvNotes(ctx.platform, 'delay-js').join('\n') || 'Use a "delay JavaScript execution" feature (WP Rocket, LiteSpeed, Perfmatters, FlyingPress).'));
      break;
    }
    case 'js-long-tasks':
      out.push(S('js', 'javascript', 'Yield to the main thread inside long work', 'Long-running loops / init code', `items.forEach((item) => processItem(item));`,
        `function yieldToMain() {\n  if (globalThis.scheduler?.yield) return scheduler.yield();\n  return new Promise((resolve) => setTimeout(resolve, 0));\n}\n\nasync function processAll(items) {\n  let last = performance.now();\n  for (const item of items) {\n    processItem(item);\n    if (performance.now() - last > 40) {   // keep tasks under ~50 ms\n      await yieldToMain();\n      last = performance.now();\n    }\n  }\n}`));
      out.push(S('js', 'javascript', 'Defer non-critical initialisation to idle time', 'App bootstrap', 'initAnalytics();\ninitChat();\ninitRecommendations();',
        `const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));\nidle(() => initAnalytics());\nidle(() => initRecommendations());\n// Chat only when the user shows intent\naddEventListener('pointerdown', () => initChat(), { once: true });`));
      break;
    case 'js-duplicates':
    case 'js-legacy':
      out.push(S('server', 'json', 'Target modern browsers (no unnecessary polyfills)', 'package.json', '"browserslist": ["> 0.2%", "ie 11"]', '"browserslist": [\n  "defaults and fully supports es6-module",\n  "not dead"\n]'));
      out.push(S('wordpress', 'php', 'Avoid duplicate jQuery / libraries', 'functions.php', '', `<?php\nadd_action( 'wp_enqueue_scripts', function () {\n\t// Remove jQuery Migrate if no plugin needs it\n\tif ( ! is_admin() ) {\n\t\twp_deregister_script( 'jquery' );\n\t\twp_register_script( 'jquery', false, array( 'jquery-core' ), null, array( 'in_footer' => true ) );\n\t}\n\t// Dequeue a second copy of a library bundled by a plugin\n\twp_dequeue_script( 'plugin-bundled-swiper' );\n}, 100 );`, ['Test thoroughly – removing jQuery Migrate can break old plugins.']));
      out.push(S('shopify', 'liquid', 'Remove duplicate libraries in the theme', 'layout/theme.liquid', '<script src="https://code.jquery.com/jquery-3.x.min.js"></script>  <!-- theme -->\n<script src="…/jquery.min.js"></script>  <!-- app -->', '{%- comment -%} Keep one copy, loaded with defer; ask app vendors to use window.jQuery if present {%- endcomment -%}'));
      break;
    case 'js-listeners':
      out.push(S('js', 'javascript', 'Event delegation + passive listeners', 'Component scripts', `document.querySelectorAll('.product-card').forEach((card) => {\n  card.addEventListener('click', onCardClick);\n});\nwindow.addEventListener('scroll', onScroll);`,
        `// One listener for all cards\ndocument.addEventListener('click', (e) => {\n  const card = e.target.closest('.product-card');\n  if (card) onCardClick.call(card, e);\n});\n// Never block scrolling\nwindow.addEventListener('scroll', onScroll, { passive: true });\nwindow.addEventListener('touchstart', onTouch, { passive: true });`));
      break;
    case 'js-dom-mutation':
    case 'dom-size':
      out.push(S('js', 'javascript', 'Batch DOM writes', 'Rendering code', `items.forEach((it) => {\n  list.innerHTML += render(it);   // re-parses the whole list each time\n});`,
        `const frag = document.createDocumentFragment();\nfor (const it of items) frag.appendChild(renderNode(it));\nlist.replaceChildren(frag);   // single DOM write`));
      out.push(S('css', 'css', 'Skip rendering work for offscreen sections', 'Global stylesheet', '', `.below-fold-section {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 800px; /* estimated height to avoid scrollbar jumps */\n}`));
      break;
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------- Third parties
function thirdPartyFixes(issue, ctx) {
  const ents = issue.evidence?.entities || [];
  const urls = ents.flatMap((e) => e.scriptUrls || []).slice(0, 6);
  const out = [];
  const consequences = ents.map((e) => `• ${e.product || e.name}: ${e.consequence}`);
  if (issue.type === 'third-party-blocking') {
    out.push(S('html', 'html', 'Make third-party tags non-blocking', '<head>', urls.map((u) => `<script src="${u}"></script>`).join('\n'), urls.map((u) => `<script src="${u}" async></script>`).join('\n'), consequences));
  } else if (issue.type === 'third-party-facade') {
    out.push(S('html', 'html', 'YouTube facade (load player on click)', 'Where the embed is placed', '<iframe src="https://www.youtube.com/embed/VIDEO_ID" width="560" height="315"></iframe>',
      `<button class="yt-facade" data-id="VIDEO_ID" style="aspect-ratio:16/9;width:100%;background:#000 url(https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg) center/cover;border:0;cursor:pointer" aria-label="Play video">\n  <svg width="68" height="48" viewBox="0 0 68 48"><path d="M66.5 7.7A8.5 8.5 0 0 0 60.5 1.7C55.2.3 34 .3 34 .3S12.8.3 7.5 1.7A8.5 8.5 0 0 0 1.5 7.7C0 13 0 24 0 24s0 11 1.5 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C68 35 68 24 68 24s0-11-1.5-16.3z" fill="red"/><path d="M45 24 27 14v20" fill="#fff"/></svg>\n</button>\n<script>\ndocument.addEventListener('click', (e) => {\n  const btn = e.target.closest('.yt-facade');\n  if (!btn) return;\n  const iframe = document.createElement('iframe');\n  iframe.src = 'https://www.youtube-nocookie.com/embed/' + btn.dataset.id + '?autoplay=1';\n  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';\n  iframe.allowFullscreen = true;\n  iframe.style.cssText = 'aspect-ratio:16/9;width:100%;border:0';\n  btn.replaceWith(iframe);\n});\n</script>`));
  } else {
    out.push(S('html', 'html', 'Interaction-triggered loader for delayable tags', 'Before </body>; remove the original <script> tags', urls.map((u) => `<script src="${u}" async></script>`).join('\n') || '<script src="…widget.js"></script>', delayLoader(urls), consequences));
    if (ents.some((e) => /Tag Manager/i.test(e.product || e.name))) {
      out.push(S('html', 'html', 'Delay Google Tag Manager (with consequences)', 'Replace the GTM <head> snippet', "<script>(function(w,d,s,l,i){…})(window,document,'script','dataLayer','GTM-XXXX');</script>",
        `<script>\n  window.dataLayer = window.dataLayer || [];\n  function loadGTM() {\n    if (window.__gtmLoaded) return; window.__gtmLoaded = true;\n    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});\n    var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';\n    j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n    })(window,document,'script','dataLayer','GTM-XXXX');\n  }\n  ['pointerdown','keydown','touchstart','scroll'].forEach(function (e) {\n    addEventListener(e, loadGTM, { once: true, passive: true });\n  });\n  addEventListener('load', function () { setTimeout(loadGTM, 3500); });\n</script>`,
        ['Consequence: tags inside GTM (analytics, ads) start ~3.5 s later or on first interaction. Very short bounces may not be recorded. Consent-mode defaults must still be set before GTM loads.']));
    }
    out.push(S('shopify', 'text', 'Shopify app scripts', 'Admin', '', 'Online Store → Themes → Customize → App embeds: disable embeds for apps you no longer use.\nSearch layout/theme.liquid and snippets/ for <script> tags left by uninstalled apps and remove them.\nFor apps used only on product pages, wrap their snippet in {% if template contains \'product\' %} … {% endif %}.\nShopify Customer Privacy API: load marketing pixels only after consent via Customer Events (Settings → Customer events) instead of theme code.'));
    out.push(S('wordpress', 'text', 'WordPress: delay third-party scripts', 'Plugin settings', '', wordpressEnvNotes(ctx.platform, 'delay-js').join('\n') || 'Use WP Rocket "Delay JavaScript execution", LiteSpeed "Load JS Deferred: Delayed", or Perfmatters "Delay JavaScript".'));
  }
  return out;
}

// ---------------------------------------------------------------- Network / server
function networkFixes(issue, ctx) {
  const out = [];
  switch (issue.type) {
    case 'compression':
      out.push(S('server', 'nginx', 'Enable Brotli + gzip (nginx)', 'nginx http{} block', '# no compression',
        `gzip on;\ngzip_comp_level 6;\ngzip_vary on;\ngzip_types text/plain text/css application/javascript application/json image/svg+xml application/xml;\n\n# Requires the ngx_brotli module\nbrotli on;\nbrotli_comp_level 5;\nbrotli_types text/plain text/css application/javascript application/json image/svg+xml application/xml;`));
      out.push(S('server', 'apache', 'Enable compression (Apache .htaccess)', '.htaccess', '', `<IfModule mod_brotli.c>\n  AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/css application/javascript application/json image/svg+xml\n</IfModule>\n<IfModule mod_deflate.c>\n  AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml\n</IfModule>`));
      break;
    case 'cache-headers': {
      const files = issue.evidence?.files || [];
      out.push(S('server', 'nginx', 'Long-lived caching for fingerprinted assets (nginx)', 'server{} block', files.slice(0, 3).map((f) => `# ${f.url} → ttl ${f.ttlMs ? Math.round(f.ttlMs / 1000) + 's' : 'none'}`).join('\n'),
        `location ~* \\.(?:css|js|mjs|woff2|avif|webp|jpg|jpeg|png|gif|svg|ico|mp4|webm)$ {\n  add_header Cache-Control "public, max-age=31536000, immutable";\n  access_log off;\n}`, ['Only use "immutable" for files whose URL changes when content changes (hash or version query).']));
      out.push(S('server', 'apache', 'Long-lived caching (Apache .htaccess)', '.htaccess', '', `<IfModule mod_headers.c>\n  <FilesMatch "\\.(css|js|woff2|avif|webp|jpe?g|png|gif|svg|ico|mp4|webm)$">\n    Header set Cache-Control "public, max-age=31536000, immutable"\n  </FilesMatch>\n</IfModule>`));
      out.push(S('server', 'json', 'Vercel / Netlify headers', 'vercel.json', '', `{\n  "headers": [\n    {\n      "source": "/assets/(.*)",\n      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]\n    }\n  ]\n}`));
      break;
    }
    case 'redirects': {
      const r = issue.evidence?.redirects || [];
      out.push(S('server', 'nginx', 'Collapse the redirect chain into one hop', 'nginx', r.map((x) => `${x.url} → ${x.location} (${x.status})`).join('\n'),
        `# Redirect every variant straight to the canonical URL in ONE hop\nserver {\n  listen 80;\n  listen 443 ssl;\n  server_name ${hostOf(r[0]?.url || ctx.url).replace(/^www\./, '')} www.${hostOf(r[0]?.url || ctx.url).replace(/^www\./, '')};\n  return 301 ${issue.evidence?.finalUrl ? new URL(issue.evidence.finalUrl).origin : 'https://www.example.com'}$request_uri;\n}`, ['Also update internal links, canonical tags, sitemaps and ad campaigns to use the final URL directly.']));
      break;
    }
    case 'ttfb':
    case 'html-cache':
      out.push(S('server', 'text', 'What to investigate (requires server access)', 'Hosting / application', issue.description,
        `1. Check whether HTML is served from a CDN/edge cache for anonymous visitors (look for HIT in cache-status headers).\n2. Add full-page caching: CDN cache rules, nginx fastcgi_cache/proxy_cache, Varnish, or your platform's page cache.\n3. Measure server processing time with Server-Timing headers or an APM (New Relic, Datadog, Query Monitor for WordPress).\n4. Look for slow database queries, external API calls during render, and missing object caching (Redis/Memcached).\n5. Use HTTP/2 or HTTP/3 and TLS 1.3; host close to your users or use a CDN with many PoPs.`, ['SpeedLab Pro measured the symptom from outside; the root cause must be confirmed on the server.']));
      out.push(S('server', 'nginx', 'Micro-cache dynamic HTML (nginx proxy_cache)', 'nginx http{} / server{}', '', `proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=html:50m max_size=1g inactive=60m;\n\nserver {\n  location / {\n    proxy_cache html;\n    proxy_cache_valid 200 301 5m;\n    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;\n    proxy_cache_background_update on;\n    proxy_cache_bypass $cookie_session $cookie_wordpress_logged_in $http_authorization;\n    add_header X-Cache-Status $upstream_cache_status;\n    proxy_pass http://app_upstream;\n  }\n}`));
      out.push(S('server', 'text', 'Cache-Control for cacheable HTML', 'Application response headers', 'Cache-Control: no-store', 'Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400\n# s-maxage applies to CDNs only; browsers always revalidate'));
      if (ctx.platform?.name === 'wordpress') out.push(S('wordpress', 'text', 'WordPress page caching', 'Plugin settings', '', wordpressEnvNotes(ctx.platform, 'ttfb').join('\n')));
      if (ctx.platform?.name === 'shopify') out.push(S('shopify', 'text', 'Shopify TTFB', 'Theme', '', 'Shopify hosts and caches storefronts; high TTFB usually comes from heavy Liquid (nested loops over all products/collections, large metafield lookups, many sections).\nUse the Shopify Theme Inspector for Chrome to profile Liquid render time and optimise the slowest snippets.'));
      break;
    case 'http2':
      out.push(S('server', 'nginx', 'Enable HTTP/2 and HTTP/3 (nginx 1.25+)', 'server{} block', 'listen 443 ssl;', 'listen 443 ssl;\nlisten 443 quic reuseport;\nhttp2 on;\nadd_header Alt-Svc \'h3=":443"; ma=86400\';'));
      break;
    case 'preconnect': {
      const origins = issue.evidence?.origins || [];
      out.push(S('html', 'html', 'Preconnect to critical origins', '<head>, before stylesheets', '<!-- none -->', origins.map((o) => `<link rel="preconnect" href="${o}"${/font|gstatic/.test(o) ? ' crossorigin' : ''}>`).join('\n'), ['Limit preconnect to 2–4 origins that are used in the first second; use dns-prefetch for the rest.']));
      break;
    }
    case 'page-weight':
      out.push(S('server', 'text', 'Performance budget', 'CI (Lighthouse CI budget.json)', '', `[\n  {\n    "resourceSizes": [\n      { "resourceType": "total", "budget": 1500 },\n      { "resourceType": "script", "budget": 350 },\n      { "resourceType": "image", "budget": 700 }\n    ]\n  }\n]`));
      break;
    case 'cls-shifts': {
      const shifts = issue.evidence?.shifts || [];
      out.push(S('css', 'css', 'Reserve space for shifting elements', 'Stylesheet', shifts.slice(0, 3).map((s) => `/* ${s.selector || s.label} shifted (${s.score ?? ''}) */`).join('\n'),
        `${shifts.slice(0, 3).map((s) => `${s.selector || '.dynamic-slot'} {\n  min-height: 60px; /* measure the final height of this element */\n}`).join('\n\n')}\n\nimg, video, iframe {\n  max-width: 100%;\n  height: auto;\n}\n.embed-16x9 { aspect-ratio: 16 / 9; }`));
      break;
    }
    default:
      break;
  }
  return out;
}

const GENERATORS = {
  'lcp-lazy': lcpImageFixes,
  'lcp-fetchpriority': lcpImageFixes,
  'lcp-preload': lcpImageFixes,
  'lcp-oversized': lcpImageFixes,
  'lcp-format': lcpImageFixes,
  'lcp-render-delay': (issue, ctx) => cssFixes({ ...issue, type: 'css-render-blocking', evidence: { files: ctx.renderBlocking || [] } }, ctx),
  'img-oversized': imageGroupFixes,
  'img-format': imageGroupFixes,
  'img-compression': imageGroupFixes,
  'img-dimensions': imageGroupFixes,
  'img-srcset': imageGroupFixes,
  'img-sizes': imageGroupFixes,
  'img-lazy-above-fold': imageGroupFixes,
  'img-lazy-missing': imageGroupFixes,
  'img-cls': imageGroupFixes,
  'img-gif': imageGroupFixes,
  'video-poster': videoFixes,
  'video-lazy': videoFixes,
  'video-mobile': videoFixes,
  'video-compress': videoFixes,
  'video-autoplay': videoFixes,
  'video-format': videoFixes,
  'video-lcp': videoFixes,
  'css-render-blocking': cssFixes,
  'css-critical': cssFixes,
  'css-unused': cssFixes,
  'css-minify': cssFixes,
  'css-large': cssFixes,
  'css-import': cssFixes,
  'css-duplicate': cssFixes,
  'css-selectors': cssFixes,
  'font-display': cssFixes,
  'font-preload': cssFixes,
  'font-format': cssFixes,
  'font-google': cssFixes,
  'js-render-blocking': jsFixes,
  'js-unused': jsFixes,
  'js-execution': jsFixes,
  'js-long-tasks': jsFixes,
  'js-duplicates': jsFixes,
  'js-legacy': jsFixes,
  'js-listeners': jsFixes,
  'js-dom-mutation': jsFixes,
  'dom-size': jsFixes,
  'third-party-delay': thirdPartyFixes,
  'third-party-blocking': thirdPartyFixes,
  'third-party-facade': thirdPartyFixes,
  compression: networkFixes,
  'cache-headers': networkFixes,
  redirects: networkFixes,
  ttfb: networkFixes,
  'html-cache': networkFixes,
  http2: networkFixes,
  preconnect: networkFixes,
  'page-weight': networkFixes,
  'cls-shifts': networkFixes,
};

/** Build a codegen context from a report. */
export function contextFromReport(report) {
  return {
    url: report?.finalUrl,
    strategy: report?.strategy,
    platform: report?.platform,
    viewportW: report?.strategy === 'desktop' ? 1350 : 412,
    renderBlocking: (report?.css?.files || []).filter((f) => f.renderBlocking).map((f) => ({ url: f.url })),
  };
}

/** Generate all snippets for an issue. */
export function generateFixes(issue, ctx = {}) {
  if (issue?.type?.startsWith('seo-')) {
    const c = issue.evidence?.seoCheck;
    const out = [];
    if (c?.code) out.push(S('html', c.codeLang === 'text' ? 'text' : 'html', c.title, c.group === 'Crawlability' ? 'robots.txt at the site root' : 'Inside <head> (or where noted)', '', c.code, [c.fix].filter(Boolean)));
    if (c?.shopify) out.push(S('shopify', /^</.test(c.shopify) ? 'liquid' : 'text', `${c.title} – Shopify`, 'layout/theme.liquid', '', c.shopify));
    return out;
  }
  const gen = GENERATORS[issue?.type];
  if (!gen) return [];
  try {
    return gen(issue, ctx).filter(Boolean);
  } catch (err) {
    return [S('html', 'text', 'Code generation failed', '', '', `Could not generate code for this issue: ${err.message}`)];
  }
}

export function availableTargets(snippets) {
  return TARGETS.filter((t) => snippets.some((s) => s.target === t.key));
}

/** Bundle snippets into a downloadable text file. */
export function snippetsToText(issue, snippets) {
  const lines = [`SpeedLab Pro – ${issue.title}`, `Priority: ${issue.priority}`, `Resource: ${issue.resource || '-'}`, '', issue.solution, ''];
  for (const s of snippets) {
    lines.push('='.repeat(72), `[${s.target.toUpperCase()}] ${s.title}`, `Placement: ${s.placement || '-'}`, '');
    if (s.before) lines.push('--- BEFORE ---', s.before, '');
    lines.push('--- AFTER ---', s.after, '');
    if (s.notes?.length) lines.push('Notes:', ...s.notes.map((n) => `- ${n}`), '');
  }
  return lines.join('\n');
}

export { optimizedImageMarkup, preloadTag, shopifyImageLiquid, wordpressImagePhp } from './images.js';
export { wordpressEnvNotes } from './wordpress.js';
export { buildResourceHints } from './resourceHints.js';
export { detectHosting } from './hosting.js';
export { buildDelayCode, DELAY_SCRIPTS, TRIGGERS } from './delayLoader.js';
export { buildWpPlugin, WP_FEATURES, WP_DEFAULT_SETTINGS } from './wpPlugin.js';
