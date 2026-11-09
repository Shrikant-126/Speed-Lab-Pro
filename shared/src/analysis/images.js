// Image optimizer analysis: merges DOM inspection (rendered vs natural size, attributes),
// Lighthouse image audits, request sizes, and Sharp re-encoding measurements.

import { audit, rows, urlOf, subItems, nodes, sameResource, normUrl } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

function formatOf(mime, url) {
  const m = (mime || '').match(/image\/([a-z0-9+.-]+)/i);
  if (m) return m[1].replace('svg+xml', 'svg').replace('x-icon', 'ico').replace('vnd.microsoft.icon', 'ico');
  const ext = (url || '').split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!ext) return null;
  return ext === 'jpg' ? 'jpeg' : ext;
}

function lhImageFindings(lhr) {
  // url -> { wastedBytes, reasons:Set, totalBytes }
  const map = new Map();
  const add = (url, totalBytes, wasted, reason) => {
    if (!url) return;
    const key = normUrl(url);
    const e = map.get(key) || { totalBytes: 0, wastedBytes: 0, reasons: new Set() };
    e.totalBytes = Math.max(e.totalBytes, totalBytes || 0);
    e.wastedBytes = Math.max(e.wastedBytes, wasted || 0);
    if (reason) e.reasons.add(reason);
    map.set(key, e);
  };
  const delivery = audit(lhr, 'image-delivery-insight');
  for (const it of rows(delivery)) {
    const subs = subItems(it);
    if (subs.length) for (const s of subs) add(urlOf(it), it.totalBytes, it.wastedBytes, s.reason || null);
    else add(urlOf(it), it.totalBytes, it.wastedBytes, null);
  }
  const legacy = [
    ['uses-responsive-images', 'Image is larger than its displayed size'],
    ['modern-image-formats', 'Use a modern format (WebP/AVIF)'],
    ['uses-optimized-images', 'Image could be compressed more'],
    ['offscreen-images', 'Offscreen image should be lazy-loaded'],
    ['efficient-animated-content', 'Use video instead of animated GIF'],
  ];
  for (const [id, reason] of legacy) {
    for (const it of rows(audit(lhr, id))) add(urlOf(it), it.totalBytes, it.wastedBytes, reason);
  }
  return map;
}

function unsizedSelectors(lhr) {
  const a = audit(lhr, 'unsized-images');
  return new Set(nodes(a).map((n) => n.selector).filter(Boolean));
}

function clsImageSelectors(inspection, lhr) {
  const set = new Set();
  for (const s of inspection?.cls?.sources || []) if (s.tag === 'img' && s.selector) set.add(s.selector);
  for (const n of nodes(audit(lhr, 'cls-culprits-insight', 'layout-shifts', 'layout-shift-elements'))) {
    if (/^<img/i.test(n.snippet || '') && n.selector) set.add(n.selector);
  }
  return set;
}

function classifyRole(img, viewportW) {
  if (img.isLcp) return 'hero';
  if (img.isBackground) return 'background';
  const u = (img.url || '').toLowerCase();
  const cls = (img.attrs?.class || '').toLowerCase();
  if (/\/products?\/|product|pdp|card__media/.test(u + cls)) return 'product';
  if (/collection/.test(u + cls)) return 'collection';
  if (img.aboveFold && img.rendered?.w >= viewportW * 0.6) return 'hero';
  if (img.attrs?.loading === 'lazy') return 'lazy-loaded';
  if (/logo/.test(u + cls + (img.attrs?.alt || '').toLowerCase())) return 'logo';
  if (/icon|sprite/.test(u + cls)) return 'icon';
  return 'content';
}

export function analyzeImages({ lhr, inspection, requests, imageProbe, lcpImageUrl }) {
  const viewportW = inspection?.viewport?.width || 412;
  const dpr = Math.min(inspection?.viewport?.dpr || 2, 2);
  const lhFindings = lhImageFindings(lhr);
  const unsized = unsizedSelectors(lhr);
  const clsSel = clsImageSelectors(inspection, lhr);
  const imageRequests = requests.filter((r) => r.type === 'image');
  const byUrl = new Map();

  const reqFor = (url) => imageRequests.find((r) => sameResource(r.url, url));

  const push = (img) => {
    const key = normUrl(img.url);
    if (!img.url || img.url.startsWith('data:') || byUrl.has(key)) return;
    byUrl.set(key, img);
  };

  for (const d of inspection?.images || []) {
    const url = d.currentSrc || d.src;
    if (!url) continue;
    push({
      url,
      selector: d.selector,
      natural: d.natural,
      rendered: d.rendered,
      aboveFold: !!d.aboveFold,
      visible: d.visible !== false,
      inPicture: !!d.inPicture,
      pictureSources: d.pictureSources || [],
      hasCssSize: !!d.hasCssSize,
      attrs: d.attrs || {},
      isBackground: false,
      snippet: d.snippet || null,
    });
  }
  for (const b of inspection?.backgroundImages || []) {
    push({
      url: b.url,
      selector: b.selector,
      natural: b.natural || null,
      rendered: b.rendered,
      aboveFold: !!b.aboveFold,
      visible: true,
      attrs: {},
      isBackground: true,
      snippet: null,
    });
  }
  // Images that Lighthouse or the network saw but the DOM inspection did not (or no inspection ran).
  for (const r of imageRequests) {
    if ((r.transferSize || 0) < 2048) continue;
    push({ url: r.url, selector: null, natural: null, rendered: null, aboveFold: null, attrs: {}, isBackground: null, snippet: null });
  }
  for (const [url] of lhFindings) push({ url, selector: null, natural: null, rendered: null, aboveFold: null, attrs: {}, isBackground: null, snippet: null });

  const images = [];
  for (const img of byUrl.values()) {
    const req = reqFor(img.url);
    const lh = lhFindings.get(normUrl(img.url));
    const probe = imageProbe?.[img.url] || null;
    const format = probe?.format || formatOf(req?.mimeType, img.url);
    const transferSize = req?.transferSize ?? lh?.totalBytes ?? probe?.bytes ?? null;
    const natural = img.natural?.w ? img.natural : probe ? { w: probe.width, h: probe.height } : null;
    const isLcp = !!lcpImageUrl && sameResource(img.url, lcpImageUrl);
    const out = {
      ...img,
      isLcp,
      format,
      transferSize,
      natural,
      requestPriority: req?.priority || null,
      thirdParty: req?.thirdParty ?? null,
      lighthouse: lh ? { wastedBytes: lh.wastedBytes, reasons: [...lh.reasons] } : null,
      probe: probe ? { webpBytes: probe.webpBytes ?? null, avifBytes: probe.avifBytes ?? null, optimizedBytes: probe.optimizedBytes ?? null, quality: probe.quality ?? null } : null,
      issues: [],
      recommended: {},
    };
    out.role = classifyRole(out, viewportW);

    const isVector = format === 'svg';
    const rw = out.rendered?.w || 0;
    const nw = natural?.w || 0;

    // Oversized
    if (!isVector && rw > 0 && nw > 0) {
      const targetW = Math.ceil(rw * dpr);
      if (nw > targetW * 1.15 && (transferSize ?? 0) > 8_000) {
        out.issues.push('oversized');
        const ratio = natural.h && natural.w ? natural.h / natural.w : (out.rendered.h || 1) / (rw || 1);
        out.recommended.width = targetW;
        out.recommended.height = Math.round(targetW * ratio);
        const areaRatio = (targetW * targetW * ratio) / (nw * natural.h || 1);
        out.recommended.estimatedResizedBytes = transferSize ? Math.round(transferSize * Math.min(1, areaRatio)) : null;
      }
    } else if (lh?.reasons.has('Image is larger than its displayed size')) {
      out.issues.push('oversized');
    }
    // Missing dimensions
    const hasAttrsWH = !!(out.attrs.width && out.attrs.height);
    if (!out.isBackground && out.attrs && Object.keys(out.attrs).length && !hasAttrsWH && !out.hasCssSize) out.issues.push('missing-dimensions');
    else if (img.selector && unsized.has(img.selector)) out.issues.push('missing-dimensions');
    // Missing srcset / sizes
    if (!out.isBackground && !isVector && rw >= 150 && Object.keys(out.attrs).length && !out.attrs.srcset && !(out.pictureSources || []).length) {
      out.issues.push('missing-srcset');
    } else if (out.attrs.srcset && !out.attrs.sizes && rw > 0 && rw < viewportW * 0.9) {
      out.issues.push('missing-sizes');
    }
    // Modern formats
    const pictureHasModern = (out.pictureSources || []).some((s) => /avif|webp/.test(s.type || ''));
    if (['jpeg', 'png', 'gif', 'bmp'].includes(format) && (transferSize ?? 0) > 15_000 && !pictureHasModern) {
      out.issues.push('legacy-format');
      out.recommended.format = format === 'png' && probe?.hasAlpha ? 'webp' : 'avif';
    }
    // Compression
    if (probe?.optimizedBytes && transferSize && probe.optimizedBytes < transferSize * 0.8 && transferSize > 20_000) {
      out.issues.push('poor-compression');
    } else if (lh?.reasons.has('Image could be compressed more')) out.issues.push('poor-compression');
    // Lazy loading
    if (!out.isBackground && out.aboveFold === true && out.attrs.loading === 'lazy') out.issues.push('lazy-above-fold');
    if (!out.isBackground && out.aboveFold === false && out.attrs.loading !== 'lazy' && (transferSize ?? 0) > 5_000) out.issues.push('not-lazy');
    else if (lh?.reasons.has('Offscreen image should be lazy-loaded')) out.issues.push('not-lazy');
    // LCP image priority
    if (isLcp && out.attrs.fetchpriority !== 'high') out.issues.push('lcp-no-fetchpriority');
    // Layout shift
    if (img.selector && clsSel.has(img.selector)) out.issues.push('causes-cls');
    if (lh?.reasons.has('Use video instead of animated GIF')) out.issues.push('animated-gif');

    // Estimated savings
    const candidates = [out.probe?.avifBytes, out.probe?.webpBytes, out.probe?.optimizedBytes, out.recommended.estimatedResizedBytes].filter(
      (x) => typeof x === 'number' && x > 0,
    );
    if (candidates.length && transferSize) {
      out.estimatedBytes = Math.min(...candidates);
      out.estimatedSource = out.probe ? 'measured (Sharp re-encode)' : 'estimate (pixel-area ratio)';
    } else if (lh?.wastedBytes && transferSize) {
      out.estimatedBytes = Math.max(0, transferSize - lh.wastedBytes);
      out.estimatedSource = 'Lighthouse estimate';
    } else out.estimatedBytes = null;
    out.savingsBytes = out.estimatedBytes !== null && transferSize ? Math.max(0, transferSize - out.estimatedBytes) : 0;

    const sev = out.issues.includes('lazy-above-fold') || out.issues.includes('lcp-no-fetchpriority') ? 2 : out.issues.includes('causes-cls') ? 1 : 0;
    out.priority = out.issues.length ? priorityFromSavings({ bytes: out.savingsBytes }, { boost: sev + (isLcp ? 1 : 0) }) : null;
    images.push(out);
  }

  images.sort((a, b) => (b.isLcp - a.isLcp) || (b.savingsBytes - a.savingsBytes) || ((b.transferSize || 0) - (a.transferSize || 0)));

  // ---- Grouped issues (one per problem type, listing affected images) ----
  const issues = [];
  const group = (code) => images.filter((i) => i.issues.includes(code));
  const sumSave = (list) => list.reduce((s, i) => s + (i.savingsBytes || 0), 0);
  const top = (list) => list.slice(0, 25).map((i) => ({
    url: i.url, selector: i.selector, natural: i.natural, rendered: i.rendered, attrs: i.attrs, format: i.format,
    transferSize: i.transferSize, recommended: i.recommended, aboveFold: i.aboveFold, isLcp: i.isLcp, snippet: i.snippet,
  }));

  const defs = [
    ['oversized', 'img-oversized', 'Images are larger than their rendered size', 'Download size is wasted on pixels that are never displayed.', 'Generate resized variants and serve them with srcset/sizes.', ['LCP', 'Speed Index']],
    ['legacy-format', 'img-format', 'Images are not served in modern formats (AVIF/WebP)', 'JPEG/PNG files are larger than AVIF/WebP at equal quality.', 'Serve AVIF/WebP via <picture> or an image CDN with automatic format negotiation.', ['LCP', 'Speed Index']],
    ['poor-compression', 'img-compression', 'Images could be compressed further', 'Re-encoding at quality ~75–80 produces visually equivalent files that are significantly smaller.', 'Compress images at build/upload time (Sharp, Squoosh, ImageOptim) or via your CDN.', ['LCP', 'Speed Index']],
    ['missing-dimensions', 'img-dimensions', 'Images are missing explicit width and height', 'Without intrinsic dimensions the browser cannot reserve space before the image loads.', 'Add width and height attributes matching the intrinsic aspect ratio (CSS can still make them responsive).', ['CLS']],
    ['missing-srcset', 'img-srcset', 'Images are missing srcset/sizes (not responsive)', 'Every device downloads the same file regardless of screen size and density.', 'Provide multiple widths via srcset and describe the layout width with sizes.', ['LCP', 'Speed Index']],
    ['missing-sizes', 'img-sizes', 'Responsive images are missing the sizes attribute', 'Without sizes the browser assumes 100vw and picks a larger candidate than needed.', 'Add a sizes attribute that matches the CSS layout width.', ['LCP']],
    ['lazy-above-fold', 'img-lazy-above-fold', 'Above-the-fold images are lazy-loaded', 'Lazy loading visible images delays them until after layout.', 'Remove loading="lazy" from images visible in the first viewport.', ['LCP']],
    ['not-lazy', 'img-lazy-missing', 'Offscreen images are not lazy-loaded', 'Below-the-fold images compete for bandwidth with critical resources during initial load.', 'Add loading="lazy" decoding="async" to images outside the initial viewport.', ['LCP', 'Speed Index', 'TBT']],
    ['causes-cls', 'img-cls', 'Images are causing layout shifts', 'These images moved content when they loaded.', 'Reserve space with width/height attributes or CSS aspect-ratio.', ['CLS']],
    ['animated-gif', 'img-gif', 'Animated GIFs should be converted to video', 'Animated GIFs are very inefficient compared to MP4/WebM.', 'Convert to MP4/WebM and use <video autoplay muted loop playsinline>.', ['LCP', 'Speed Index']],
  ];
  for (const [code, type, title, why, solution, metrics] of defs) {
    const list = group(code);
    if (!list.length) continue;
    const bytes = ['oversized', 'legacy-format', 'poor-compression', 'not-lazy', 'animated-gif', 'missing-srcset'].includes(code) ? sumSave(list) : 0;
    const boost = code === 'lazy-above-fold' ? 2 : code === 'causes-cls' || code === 'missing-dimensions' ? 1 : 0;
    issues.push(makeIssue({
      type,
      category: code === 'causes-cls' || code === 'missing-dimensions' ? 'cls' : 'images',
      title: `${title} (${list.length})`,
      description: `${list.length} image${list.length > 1 ? 's' : ''} affected.${bytes ? ` Potential saving ≈ ${Math.round(bytes / 1024)} KB.` : ''}`,
      resource: list[0].url,
      why,
      impact: `Affects ${metrics.join(', ')}.`,
      metrics,
      priority: priorityFromSavings({ bytes }, { boost }),
      solution,
      evidence: { images: top(list) },
      savings: bytes ? { bytes, source: list.some((i) => i.probe) ? 'measured' : 'estimate' } : null,
    }));
  }

  const totals = {
    count: images.length,
    bytes: images.reduce((s, i) => s + (i.transferSize || 0), 0),
    potentialSavings: sumSave(images),
    withIssues: images.filter((i) => i.issues.length).length,
  };
  return { images, issues, totals };
}

