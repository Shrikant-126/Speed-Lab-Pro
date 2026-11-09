// Advanced LCP breakdown: element identification, the four LCP sub-parts, and
// discovery/priority checks for LCP images.

import { audit, rows, nodes, checklist, attrFromSnippet, hasAttr, sameResource, urlOf } from './lhr.js';
import { makeIssue } from './issue.js';

const PHASES = [
  { key: 'ttfb', label: 'Time to First Byte', re: /first.?byte|ttfb/i },
  { key: 'loadDelay', label: 'Resource Load Delay', re: /load.?delay/i },
  { key: 'loadDuration', label: 'Resource Load Duration', re: /load.?(duration|time)/i },
  { key: 'renderDelay', label: 'Element Render Delay', re: /render.?delay/i },
];

const PHASE_EXPLAIN = {
  ttfb: 'The server took a long time to deliver the first byte of HTML. Nothing can render until the document arrives.',
  loadDelay:
    'The browser discovered or started downloading the LCP resource late. Typical causes: the image is injected by JavaScript, set as a CSS background, lazy-loaded, or competes with lower-priority requests.',
  loadDuration:
    'The LCP resource itself took long to download. Typical causes: an oversized file, a legacy format (JPEG/PNG instead of AVIF/WebP), or a slow/uncached origin.',
  renderDelay:
    'The resource was ready but the element was not painted. Typical causes: render-blocking CSS/JS, web fonts blocking text, client-side rendering, or main-thread long tasks.',
};

function phasesFromLighthouse(lhr) {
  const a = audit(lhr, 'lcp-breakdown-insight', 'lcp-phases-insight', 'largest-contentful-paint-element');
  if (!a) return null;
  const items = rows(a);
  const found = {};
  for (const it of items) {
    const name = `${it.subpart || ''} ${it.phase || ''} ${it.label || ''}`;
    const value = it.duration ?? it.timing ?? it.value;
    if (typeof value !== 'number') continue;
    for (const p of PHASES) {
      if (found[p.key] === undefined && p.re.test(name)) {
        found[p.key] = value;
        break;
      }
    }
  }
  // Text LCP elements report only TTFB + render delay; fill missing resource phases with 0.
  if (found.ttfb === undefined && found.renderDelay === undefined) return null;
  return PHASES.map((p) => ({ key: p.key, label: p.label, ms: Math.max(0, Math.round(found[p.key] ?? 0)) }));
}

function phasesFromInspection(inspection, lcpUrl) {
  const nav = inspection?.navigation;
  const lcp = inspection?.lcp;
  if (!nav || !lcp?.time) return null;
  const ttfb = nav.ttfb ?? 0;
  let loadStart = ttfb;
  let loadEnd = ttfb;
  if (lcpUrl) {
    const rt = (inspection.resourceTimings || []).find((r) => sameResource(r.name, lcpUrl));
    if (rt) {
      loadStart = Math.max(ttfb, rt.startTime);
      loadEnd = Math.max(loadStart, rt.responseEnd);
    }
  }
  return [
    { key: 'ttfb', label: PHASES[0].label, ms: Math.round(ttfb) },
    { key: 'loadDelay', label: PHASES[1].label, ms: Math.round(loadStart - ttfb) },
    { key: 'loadDuration', label: PHASES[2].label, ms: Math.round(loadEnd - loadStart) },
    { key: 'renderDelay', label: PHASES[3].label, ms: Math.max(0, Math.round(lcp.time - loadEnd)) },
  ];
}

function resolveUrl(u, base) {
  if (!u) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function formatFrom(mime, url) {
  if (mime) {
    const m = mime.match(/image\/([a-z0-9+.-]+)/i);
    if (m) return m[1].replace('svg+xml', 'svg').replace('jpeg', 'jpeg');
  }
  const ext = (url || '').split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!ext) return null;
  return ext === 'jpg' ? 'jpeg' : ext;
}

export function analyzeLcp({ lhr, inspection, requests, probe, finalUrl, imageProbe, lcpMetricMs }) {
  const issues = [];
  const elAudit = audit(lhr, 'lcp-breakdown-insight', 'lcp-phases-insight', 'largest-contentful-paint-element');
  const discovery = audit(lhr, 'lcp-discovery-insight', 'prioritize-lcp-image');
  const node = nodes(elAudit)[0] || nodes(discovery)[0] || null;
  const insp = inspection?.lcp || null;

  const snippet = node?.snippet || insp?.snippet || null;
  const tag = (insp?.tag || snippet?.match(/^<([a-z0-9-]+)/i)?.[1] || '').toLowerCase() || null;

  // ---- LCP resource URL --------------------------------------------------
  let imageUrl = insp?.url || null;
  if (!imageUrl && snippet && tag === 'img') {
    imageUrl = resolveUrl(attrFromSnippet(snippet, 'src') || attrFromSnippet(snippet, 'data-src'), finalUrl);
  }
  if (!imageUrl) {
    const pr = rows(audit(lhr, 'prioritize-lcp-image'))[0];
    imageUrl = urlOf(pr) || null;
  }
  if (!imageUrl && snippet && tag === 'video') imageUrl = resolveUrl(attrFromSnippet(snippet, 'poster'), finalUrl);

  const isBackground = !!insp?.isBackground || (!!imageUrl && tag && !['img', 'image', 'video', 'svg'].includes(tag));
  const type = imageUrl ? (tag === 'video' ? 'video-poster' : isBackground ? 'background-image' : 'image') : snippet || insp ? 'text' : null;

  // ---- Phases ---------------------------------------------------------------
  let phases = phasesFromLighthouse(lhr);
  let phaseSource = phases ? 'lighthouse' : null;
  if (!phases) {
    phases = phasesFromInspection(inspection, imageUrl);
    if (phases) phaseSource = 'playwright-unthrottled';
  }
  let phaseNote = null;
  if (phases && phaseSource === 'lighthouse' && typeof lcpMetricMs === 'number') {
    const sum = phases.reduce((s, p) => s + p.ms, 0);
    if (sum > 0 && Math.abs(sum - lcpMetricMs) / lcpMetricMs > 0.25) {
      phaseSource = 'lighthouse-observed';
      phaseNote = `Lighthouse measures these phases from the real (unthrottled) page load, which totals ${Math.round(sum)} ms, while the LCP metric of ${Math.round(lcpMetricMs)} ms is simulated on a throttled mobile connection. Use the phases to see which part dominates, not as exact throttled timings.`;
    }
  }
  let dominant = null;
  if (phases) {
    const total = phases.reduce((s, p) => s + p.ms, 0) || 1;
    for (const p of phases) p.percent = Math.round((p.ms / total) * 1000) / 10;
    dominant = [...phases].sort((a, b) => b.ms - a.ms)[0];
  }

  // ---- Image facts --------------------------------------------------------
  const request = imageUrl ? requests.find((r) => sameResource(r.url, imageUrl)) : null;
  const domImage = imageUrl
    ? (inspection?.images || []).find((i) => sameResource(i.currentSrc || i.src, imageUrl))
    : null;
  const attrs = domImage?.attrs || insp?.attrs || {};
  const snippetAttr = (n) => attrs[n] ?? attrFromSnippet(snippet, n);
  const probeInfo = imageUrl ? imageProbe?.[imageUrl] || null : null;

  const loadingAttr = snippetAttr('loading');
  const fetchPriority = snippetAttr('fetchpriority');
  const checks = checklist(discovery);
  const preloadedViaLink =
    (imageUrl && (inspection?.preloads || []).some((p) => sameResource(p.href, imageUrl) || (p.imagesrcset || '').includes(imageUrl.split('?')[0]))) ||
    !!request?.isLinkPreload;

  let discoverableInHtml = null;
  if (typeof checks.requestDiscoverable?.value === 'boolean') discoverableInHtml = checks.requestDiscoverable.value;
  else if (imageUrl && probe?.html) {
    try {
      const u = new URL(imageUrl);
      const name = u.pathname.split('/').pop();
      discoverableInHtml = !!name && probe.html.includes(name);
    } catch {
      discoverableInHtml = null;
    }
  }
  const usesLazyLibrary = !!snippet && (/data-(src|srcset|lazy)/i.test(snippet) || /class="[^"]*lazy/i.test(snippet));

  const image = imageUrl
    ? {
        url: imageUrl,
        format: probeInfo?.format || formatFrom(request?.mimeType, imageUrl),
        transferSize: request?.transferSize ?? probeInfo?.bytes ?? null,
        natural: domImage?.natural || insp?.natural || (probeInfo ? { w: probeInfo.width, h: probeInfo.height } : null),
        rendered: domImage?.rendered || insp?.rendered || null,
        requestPriority: request?.priority || null,
        requestStartMs: request?.startMs ?? null,
        requestDurationMs: request?.durationMs ?? null,
        webpBytes: probeInfo?.webpBytes ?? null,
        avifBytes: probeInfo?.avifBytes ?? null,
        attrs: {
          loading: loadingAttr,
          fetchpriority: fetchPriority,
          decoding: snippetAttr('decoding'),
          width: snippetAttr('width'),
          height: snippetAttr('height'),
          srcset: snippetAttr('srcset'),
          sizes: snippetAttr('sizes'),
          alt: snippetAttr('alt'),
        },
      }
    : null;

  const checksOut = imageUrl
    ? {
        lazyLoaded: loadingAttr === 'lazy' || checks.eagerlyLoaded?.value === false,
        fetchPriorityHigh: fetchPriority === 'high' || checks.priorityHinted?.value === true,
        preloaded: preloadedViaLink,
        cssBackground: isBackground,
        discoverableInHtml,
        jsDelaysDiscovery: discoverableInHtml === false || usesLazyLibrary,
        responsive: !!(image.attrs.srcset || domImage?.inPicture),
        hasDimensions: !!(image.attrs.width && image.attrs.height) || hasAttr(snippet, 'style'),
      }
    : null;

  // ---- Issues ---------------------------------------------------------------
  const lcpMs = lcpMetricMs ?? null;
  const lcpSlow = lcpMs === null || lcpMs > 2500;
  const ev = { snippet, imageUrl, selector: node?.selector || insp?.selector, image, phases, isBackground, finalUrl };
  const loadDelay = phases?.find((p) => p.key === 'loadDelay')?.ms ?? null;

  if (checksOut?.lazyLoaded) {
    issues.push(makeIssue({
      type: 'lcp-lazy',
      category: 'lcp',
      title: 'LCP image is lazy-loaded',
      description: 'The largest above-the-fold image has loading="lazy" (or a lazy-load library), so the browser waits for layout before requesting it.',
      resource: imageUrl,
      why: 'Lazy loading defers the request until the browser knows the image is in the viewport, which adds the full layout time to the LCP resource load delay.',
      impact: 'Directly increases LCP resource load delay.',
      metrics: ['LCP'],
      priority: 'critical',
      solution: 'Remove loading="lazy" from the LCP image, use loading="eager" and add fetchpriority="high".',
      evidence: ev,
      savings: loadDelay ? { ms: loadDelay, source: 'estimate' } : null,
    }));
  }
  if (imageUrl && !checksOut.fetchPriorityHigh && lcpSlow) {
    issues.push(makeIssue({
      type: 'lcp-fetchpriority',
      category: 'lcp',
      title: 'LCP image is not prioritised (missing fetchpriority="high")',
      description: `The LCP image was requested with "${image.requestPriority || 'default'}" priority. Images start as Low priority until layout proves they are visible.`,
      resource: imageUrl,
      why: 'Without a priority hint the LCP image competes with scripts, styles and other images for bandwidth.',
      impact: 'Increases LCP resource load delay and load duration.',
      metrics: ['LCP'],
      priority: lcpMs && lcpMs > 4000 ? 'critical' : 'high',
      solution: 'Add fetchpriority="high" to the LCP <img> (and to its preload link if one is used).',
      evidence: ev,
    }));
  }
  if (imageUrl && (isBackground || checksOut.discoverableInHtml === false) && !checksOut.preloaded) {
    issues.push(makeIssue({
      type: 'lcp-preload',
      category: 'lcp',
      title: isBackground ? 'LCP image is a CSS background and is not preloaded' : 'LCP image is not discoverable in the initial HTML',
      description: isBackground
        ? 'The LCP element paints a CSS background-image. The browser only finds it after downloading and parsing the stylesheet.'
        : 'The LCP image URL is not present in the server-rendered HTML; it is inserted later by JavaScript or a lazy-load library.',
      resource: imageUrl,
      why: 'The preload scanner can only start downloads for URLs it can see in the HTML markup.',
      impact: 'Adds stylesheet/script download and execution time to LCP resource load delay.',
      metrics: ['LCP'],
      priority: 'critical',
      solution: isBackground
        ? 'Prefer an <img> element for hero images. If the background must stay, add <link rel="preload" as="image" fetchpriority="high"> in the <head>.'
        : 'Render the hero <img> with a real src in the HTML, or add a <link rel="preload" as="image"> in the <head>.',
      evidence: ev,
      savings: loadDelay ? { ms: loadDelay, source: 'estimate' } : null,
    }));
  }
  if (image?.natural?.w && image?.rendered?.w && image.natural.w > image.rendered.w * 2.2 && image.transferSize > 50_000) {
    const dpr = inspection?.viewport?.dpr || 2;
    const target = Math.round(image.rendered.w * Math.min(dpr, 2));
    issues.push(makeIssue({
      type: 'lcp-oversized',
      category: 'lcp',
      title: `LCP image is ${image.natural.w}px wide but displayed at ${image.rendered.w}px`,
      description: 'The LCP image is much larger than its rendered size, wasting bytes on the most critical download.',
      resource: imageUrl,
      why: 'Serving one large image to every device makes phones download desktop-sized files.',
      impact: 'Increases LCP resource load duration.',
      metrics: ['LCP'],
      priority: 'high',
      solution: `Serve a responsive image with srcset; a ~${target}px variant is enough for this viewport.`,
      evidence: { ...ev, targetWidth: target },
    }));
  }
  if (image && ['jpeg', 'png'].includes(image.format) && (image.transferSize ?? 0) > 30_000) {
    const best = Math.min(...[image.avifBytes, image.webpBytes].filter((x) => typeof x === 'number'));
    issues.push(makeIssue({
      type: 'lcp-format',
      category: 'lcp',
      title: `LCP image uses ${image.format.toUpperCase()} instead of AVIF/WebP`,
      description: 'Modern formats are typically 25–50% smaller at the same visual quality.',
      resource: imageUrl,
      why: 'Legacy formats compress photographic content less efficiently.',
      impact: 'Increases LCP resource load duration.',
      metrics: ['LCP'],
      priority: 'high',
      solution: 'Serve AVIF/WebP with a <picture> element (or let your image CDN negotiate the format).',
      evidence: ev,
      savings: Number.isFinite(best) && image.transferSize ? { bytes: Math.max(0, image.transferSize - best), source: 'measured' } : null,
    }));
  }
  if (dominant?.key === 'renderDelay' && dominant.ms > 500 && lcpSlow) {
    issues.push(makeIssue({
      type: 'lcp-render-delay',
      category: 'lcp',
      title: `Element render delay is the largest LCP phase (${dominant.ms} ms)`,
      description: PHASE_EXPLAIN.renderDelay,
      resource: node?.selector || imageUrl,
      why: 'The LCP content was available but painting was blocked.',
      impact: 'Directly adds to LCP.',
      metrics: ['LCP', 'FCP'],
      priority: dominant.ms > 1500 ? 'critical' : 'high',
      solution: 'Inline critical CSS, defer non-critical CSS/JS, and avoid hiding content until JavaScript runs (e.g. opacity:0 animations, sliders initialising).',
      evidence: ev,
      savings: { ms: dominant.ms, source: 'estimate' },
    }));
  }

  return {
    element: node || insp
      ? {
          selector: node?.selector || insp?.selector || null,
          snippet,
          nodeLabel: node?.nodeLabel || null,
          tag,
          boundingRect: node?.boundingRect || insp?.rect || null,
        }
      : null,
    type,
    imageUrl,
    image,
    checks: checksOut,
    phases,
    phaseSource,
    phaseNote,
    dominantPhase: dominant ? { ...dominant, explanation: PHASE_EXPLAIN[dominant.key] } : null,
    explanations: PHASE_EXPLAIN,
    issues,
  };
}
