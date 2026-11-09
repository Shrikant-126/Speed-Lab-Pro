// Playwright + Chrome DevTools Protocol page inspection.
// Collects element-level data that Lighthouse/PSI does not expose in full:
// rendered vs natural image sizes, background images, videos, scripts/styles, preloads,
// event-listener counts, DOM mutations, CSS/JS coverage, CDP performance metrics,
// LCP element, layout shift sources and navigation timing.
//
// SSRF: every request the browser makes is checked against the public-IP policy.

import { resolvePublic, checkUrlStructure } from '@speedlab/shared/net';

let pw = null;
let pwChecked = false;

export async function loadPlaywright() {
  if (pwChecked) return pw;
  pwChecked = true;
  try {
    pw = await import('playwright');
    const fs = await import('node:fs');
    if (!fs.existsSync(pw.chromium.executablePath())) pw = null;
  } catch {
    pw = null;
  }
  return pw;
}

export async function playwrightAvailable() {
  return !!(await loadPlaywright());
}

const DEVICES = {
  mobile: {
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  },
  desktop: {
    viewport: { width: 1350, height: 940 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
};

// Runs in the page before any page script.
const INIT_SCRIPT = `(() => {
  const S = window.__speedlab = {
    listeners: { total: 0, byType: {}, scrollLike: 0, nonPassive: 0 },
    mutations: { count: 0, added: 0, attributes: 0 },
    lcp: null, cls: 0, clsSources: [], longTasks: [], fcp: null,
  };
  try {
    const orig = EventTarget.prototype.addEventListener;
    const scrollLike = new Set(['scroll', 'wheel', 'mousewheel', 'touchstart', 'touchmove']);
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      try {
        const L = S.listeners;
        L.total++;
        L.byType[type] = (L.byType[type] || 0) + 1;
        if (scrollLike.has(type)) {
          L.scrollLike++;
          if (!(opts && typeof opts === 'object' && opts.passive)) L.nonPassive++;
        }
      } catch (e) {}
      return orig.call(this, type, fn, opts);
    };
  } catch (e) {}
  try {
    new MutationObserver((list) => {
      S.mutations.count += list.length;
      for (const m of list) {
        if (m.type === 'childList') S.mutations.added += m.addedNodes.length;
        else if (m.type === 'attributes') S.mutations.attributes++;
      }
    }).observe(document, { childList: true, subtree: true, attributes: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) S.lcp = { time: e.startTime, renderTime: e.renderTime, loadTime: e.loadTime, size: e.size, url: e.url || null, el: e.element || null };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        S.cls += e.value;
        for (const s of e.sources || []) if (s.node) S.clsSources.push({ node: s.node, value: e.value });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) S.longTasks.push({ start: e.startTime, duration: e.duration, attribution: (e.attribution && e.attribution[0] && (e.attribution[0].containerSrc || e.attribution[0].containerName)) || null });
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') S.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
})();`;

// Runs in the page after load; returns plain JSON.
function collectInPage() {
  const S = window.__speedlab || {};
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const sel = (el) => {
    if (!el || el.nodeType !== 1) return null;
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return `#${el.id}`;
    const parts = [];
    let node = el;
    for (let i = 0; node && node.nodeType === 1 && i < 4; i += 1) {
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList].filter((c) => /^[a-zA-Z_][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) part += `.${cls.join('.')}`;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node.id) break;
      node = parent;
    }
    return parts.join(' > ');
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), inView: r.top < vh && r.bottom > 0 && r.width > 0 && r.height > 0 };
  };
  const openTag = (el) => {
    const html = el.outerHTML || '';
    const end = html.indexOf('>');
    return (end > 0 ? html.slice(0, end + 1) : html).slice(0, 1200);
  };
  const attrs = (el, names) => Object.fromEntries(names.map((n) => [n, el.getAttribute(n)]));
  const visible = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const images = [...document.images].slice(0, 400).map((img) => {
    const r = rectOf(img);
    const cs = getComputedStyle(img);
    const pic = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null;
    return {
      src: img.getAttribute('src'),
      currentSrc: img.currentSrc || img.src || null,
      selector: sel(img),
      snippet: openTag(img),
      natural: img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null,
      rendered: { w: r.w, h: r.h },
      rect: r,
      aboveFold: r.inView,
      visible: visible(img),
      complete: img.complete,
      hasCssSize: cs.aspectRatio && cs.aspectRatio !== 'auto' && !cs.aspectRatio.startsWith('auto '),
      inPicture: !!pic,
      pictureSources: pic ? [...pic.querySelectorAll('source')].map((s) => ({ type: s.type || null, srcset: (s.srcset || '').slice(0, 300), media: s.media || null })) : [],
      attrs: attrs(img, ['loading', 'decoding', 'fetchpriority', 'width', 'height', 'srcset', 'sizes', 'alt', 'class']),
    };
  });

  const backgroundImages = [];
  const seenBg = new Set();
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length && i < 5000 && backgroundImages.length < 80; i += 1) {
    const el = all[i];
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) continue;
    const r = rectOf(el);
    if (r.w * r.h < 2500) continue;
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (m[1].startsWith('data:')) continue;
      let abs;
      try { abs = new URL(m[1], location.href).href; } catch { continue; }
      if (seenBg.has(abs)) continue;
      seenBg.add(abs);
      backgroundImages.push({ url: abs, selector: sel(el), rendered: { w: r.w, h: r.h }, aboveFold: r.inView });
    }
  }

  const videos = [...document.querySelectorAll('video')].slice(0, 30).map((v) => {
    const r = rectOf(v);
    return {
      selector: sel(v),
      snippet: v.outerHTML.slice(0, 1200),
      src: v.getAttribute('src'),
      currentSrc: v.currentSrc || null,
      sources: [...v.querySelectorAll('source')].map((s) => ({ src: s.src || s.getAttribute('data-src'), type: s.type || null, media: s.media || null })),
      autoplay: v.autoplay,
      muted: v.muted || v.hasAttribute('muted'),
      loop: v.loop,
      playsinline: v.hasAttribute('playsinline'),
      controls: v.controls,
      preload: v.getAttribute('preload'),
      poster: v.getAttribute('poster'),
      rendered: { w: r.w, h: r.h },
      aboveFold: r.inView,
      hidden: !visible(v),
      readyState: v.readyState,
    };
  });

  const iframes = [...document.querySelectorAll('iframe')].slice(0, 40).map((f) => ({ src: f.src, loading: f.getAttribute('loading'), aboveFold: rectOf(f).inView }));

  const head = document.head;
  const scripts = [...document.scripts].map((s) => ({
    src: s.src || null,
    async: s.async,
    defer: s.defer,
    module: s.type === 'module',
    inHead: head.contains(s),
    inline: !s.src,
    bytes: s.src ? null : (s.textContent || '').length,
  }));
  const inlineScriptBytes = scripts.filter((s) => s.inline).reduce((a, s) => a + (s.bytes || 0), 0);
  const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"]')].map((l) => ({ href: l.href, media: l.media || null, inHead: head.contains(l), disabled: l.disabled }));
  const inlineStyleBytes = [...document.querySelectorAll('style')].reduce((a, s) => a + (s.textContent || '').length, 0);
  const preloads = [...document.querySelectorAll('link[rel="preload"]')].map((l) => ({ href: l.href, as: l.getAttribute('as'), fetchpriority: l.getAttribute('fetchpriority'), imagesrcset: l.getAttribute('imagesrcset') }));
  const preconnects = [...document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]')].map((l) => ({ href: l.href, rel: l.rel }));
  const fonts = [];
  try { document.fonts.forEach((f) => fonts.push({ family: f.family, display: f.display, status: f.status, weight: f.weight })); } catch (e) { /* ignore */ }

  let lcp = null;
  if (S.lcp) {
    const el = S.lcp.el;
    const tag = el ? el.tagName.toLowerCase() : null;
    const r = el ? rectOf(el) : null;
    lcp = {
      time: S.lcp.time,
      renderTime: S.lcp.renderTime,
      loadTime: S.lcp.loadTime,
      size: S.lcp.size,
      url: S.lcp.url || null,
      tag,
      selector: el ? sel(el) : null,
      snippet: el ? openTag(el) : null,
      isBackground: !!S.lcp.url && tag !== 'img' && tag !== 'video' && tag !== 'image',
      rect: r,
      rendered: r ? { w: r.w, h: r.h } : null,
      natural: tag === 'img' && el.naturalWidth ? { w: el.naturalWidth, h: el.naturalHeight } : null,
      attrs: tag === 'img' ? attrs(el, ['loading', 'decoding', 'fetchpriority', 'width', 'height', 'srcset', 'sizes', 'alt']) : null,
    };
  }
  const clsMap = new Map();
  for (const s of S.clsSources || []) {
    const el = s.node && s.node.nodeType === 1 ? s.node : s.node && s.node.parentElement;
    if (!el) continue;
    const key = sel(el);
    const prev = clsMap.get(key) || { selector: key, tag: el.tagName.toLowerCase(), snippet: openTag(el), value: 0 };
    prev.value += s.value;
    clsMap.set(key, prev);
  }

  const nav = performance.getEntriesByType('navigation')[0];
  const navigation = nav
    ? {
        dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        tcp: Math.round((nav.secureConnectionStart > 0 ? nav.secureConnectionStart : nav.connectEnd) - nav.connectStart),
        tls: nav.secureConnectionStart > 0 ? Math.round(nav.connectEnd - nav.secureConnectionStart) : 0,
        serverWait: Math.round(nav.responseStart - nav.requestStart),
        // Sum of real network phases; excludes time the scanner's SSRF request interception adds.
        ttfb: Math.round((nav.redirectEnd - nav.redirectStart) + (nav.domainLookupEnd - nav.domainLookupStart) + (nav.connectEnd - nav.connectStart) + (nav.responseStart - nav.requestStart)),
        rawResponseStart: Math.round(nav.responseStart),
        download: Math.round(nav.responseEnd - nav.responseStart),
        redirectTime: Math.round(nav.redirectEnd - nav.redirectStart),
        redirectCount: nav.redirectCount,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd),
        transferSize: nav.transferSize,
        protocol: nav.nextHopProtocol,
      }
    : null;
  const resourceTimings = performance.getEntriesByType('resource').slice(0, 600).map((r) => ({
    name: r.name, initiatorType: r.initiatorType, startTime: Math.round(r.startTime), responseEnd: Math.round(r.responseEnd), transferSize: r.transferSize,
  }));

  const g = {};
  try {
    const versions = [];
    if (window.jQuery && window.jQuery.fn) versions.push(window.jQuery.fn.jquery);
    if (window.$ && window.$.fn && window.$.fn.jquery && window.$ !== window.jQuery) versions.push(window.$.fn.jquery);
    g.jqueryVersions = versions;
    g.react = !!(window.React || document.querySelector('[data-reactroot]'));
    g.vue = !!window.Vue;
  } catch (e) { /* ignore */ }

  let depth = 0;
  const walk = (n, d) => { if (d > depth) depth = d; for (const c of n.children) walk(c, d + 1); };
  try { walk(document.documentElement, 1); } catch (e) { /* ignore */ }

  return {
    finalUrl: location.href,
    viewport: { width: vw, height: vh, dpr: window.devicePixelRatio },
    images,
    backgroundImages,
    videos,
    iframes,
    scripts,
    stylesheets,
    inlineStyleBytes,
    inlineScriptBytes,
    preloads,
    preconnects,
    fonts,
    lcp,
    cls: { value: S.cls || 0, sources: [...clsMap.values()].sort((a, b) => b.value - a.value).slice(0, 15) },
    paint: { fcp: S.fcp },
    longTasks: (S.longTasks || []).slice(0, 50),
    listeners: S.listeners,
    mutations: S.mutations,
    navigation,
    resourceTimings,
    globals: g,
    domNodes: document.getElementsByTagName('*').length,
    domDepth: depth,
  };
}

// ---- Coverage helpers ---------------------------------------------------------
function cssStats(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const imports = [...clean.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)].map((m) => m[1]);
  let selectors = 0;
  const rules = [];
  for (const m of clean.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const s = m[1].trim();
    if (!s || /^(from|to|\d+%)/.test(s)) continue;
    selectors += s.split(',').length;
    rules.push(`${s.replace(/\s+/g, ' ')}{${m[2].replace(/\s+/g, '')}}`);
  }
  return { imports, selectors, rules };
}

function jsUsedBytes(entry) {
  const len = entry.source ? entry.source.length : 0;
  if (!len) return { totalBytes: 0, usedBytes: 0 };
  const used = new Uint8Array(len);
  const ranges = [];
  for (const fn of entry.functions || []) for (const r of fn.ranges || []) ranges.push(r);
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) used.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(len, r.endOffset));
  let n = 0;
  for (let i = 0; i < len; i += 1) n += used[i];
  return { totalBytes: len, usedBytes: n };
}

// ---- Main ---------------------------------------------------------------------
export async function inspectPage(url, strategy, { signal, timeoutMs = 60_000 } = {}) {
  const playwright = await loadPlaywright();
  if (!playwright) throw new Error('Playwright is not available');
  const device = DEVICES[strategy] || DEVICES.mobile;
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const onAbort = () => browser.close().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  const hardTimer = setTimeout(onAbort, timeoutMs + 30_000);

  try {
    const context = await browser.newContext({
      ...device,
      serviceWorkers: 'block',
      acceptDownloads: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      locale: 'en-US',
    });
    // SSRF guard for every browser request (incl. redirects and subresources).
    await context.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      if (/^(data|blob|about):/.test(reqUrl)) return route.continue();
      try {
        const u = new URL(reqUrl);
        checkUrlStructure(u);
        await resolvePublic(u.hostname.replace(/^\[|\]$/g, ''));
        return route.continue();
      } catch {
        return route.abort('blockedbyclient');
      }
    });
    await context.addInitScript(INIT_SCRIPT);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    const responses = [];
    const t0 = Date.now();
    page.on('requestfinished', async (req) => {
      try {
        const sizes = await req.sizes();
        const res = await req.response();
        const timing = req.timing();
        responses.push({
          url: req.url(),
          status: res?.status() ?? null,
          contentType: (await res?.headerValue('content-type')) || null,
          bytes: sizes.responseBodySize + sizes.responseHeadersSize,
          startMs: timing.startTime > 0 ? timing.startTime - t0 : null,
          endMs: timing.startTime > 0 && timing.responseEnd > 0 ? timing.startTime - t0 + timing.responseEnd : null,
          resourceType: req.resourceType(),
        });
      } catch {
        /* request may be gone */
      }
    });

    await Promise.all([
      page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false }),
      page.coverage.startCSSCoverage({ resetOnNavigation: false }),
    ]);

    // Pre-warm the SSRF DNS cache so request interception adds minimal latency.
    await resolvePublic(new URL(url).hostname).catch(() => {});
    const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    if (!response) throw new Error('No response from page');
    if (response.status() >= 400) throw new Error(`Page returned HTTP ${response.status()}`);
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const data = await page.evaluate(collectInPage);
    const [jsCov, cssCov] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);
    const metricsRaw = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
    const cdpMetrics = Object.fromEntries((metricsRaw.metrics || []).map((m) => [m.name, m.value]));

    // CSS coverage + parsed stats
    const ruleCounts = new Map();
    const cssStatsList = cssCov.map((c) => {
      const text = c.text || '';
      const usedBytes = (c.ranges || []).reduce((s, r) => s + (r.end - r.start), 0);
      const st = cssStats(text);
      for (const r of st.rules) ruleCounts.set(r, (ruleCounts.get(r) || 0) + 1);
      return { url: c.url, totalBytes: text.length, usedBytes, selectors: st.selectors, imports: st.imports, rules: st.rules };
    });
    const css = cssStatsList.map(({ rules, ...rest }) => ({
      ...rest,
      duplicateRules: rules.filter((r) => ruleCounts.get(r) > 1 && r.length > 20).length,
    }));
    // JS coverage aggregated per URL
    const jsMap = new Map();
    for (const e of jsCov) {
      if (!e.url || !/^https?:/.test(e.url)) continue;
      const u = jsUsedBytes(e);
      const prev = jsMap.get(e.url) || { url: e.url, totalBytes: 0, usedBytes: 0 };
      prev.totalBytes += u.totalBytes;
      prev.usedBytes += u.usedBytes;
      jsMap.set(e.url, prev);
    }

    await context.close();
    return {
      ...data,
      coverage: { css, js: [...jsMap.values()] },
      cdpMetrics: {
        Nodes: cdpMetrics.Nodes,
        JSHeapUsedSize: cdpMetrics.JSHeapUsedSize,
        LayoutCount: cdpMetrics.LayoutCount,
        RecalcStyleCount: cdpMetrics.RecalcStyleCount,
        LayoutDuration: cdpMetrics.LayoutDuration ? Math.round(cdpMetrics.LayoutDuration * 1000) : null,
        RecalcStyleDuration: cdpMetrics.RecalcStyleDuration ? Math.round(cdpMetrics.RecalcStyleDuration * 1000) : null,
        ScriptDuration: cdpMetrics.ScriptDuration ? Math.round(cdpMetrics.ScriptDuration * 1000) : null,
        TaskDuration: cdpMetrics.TaskDuration ? Math.round(cdpMetrics.TaskDuration * 1000) : null,
        JSEventListeners: cdpMetrics.JSEventListeners,
      },
      responses: responses.slice(0, 600),
      status: response.status(),
    };
  } finally {
    clearTimeout(hardTimer);
    signal?.removeEventListener('abort', onAbort);
    await browser.close().catch(() => {});
  }
}
