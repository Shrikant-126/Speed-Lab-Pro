// CSS performance analysis: render-blocking, unused, large, duplicate, @import, selectors, fonts.

import { audit, rows, urlOf, sameResource, normUrl, savings } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

export function analyzeCss({ lhr, inspection, requests }) {
  const cssRequests = requests.filter((r) => r.type === 'css');
  const files = new Map();
  const get = (url) => {
    const key = normUrl(url);
    if (!files.has(key)) {
      const req = cssRequests.find((r) => sameResource(r.url, url));
      files.set(key, {
        url,
        transferSize: req?.transferSize ?? null,
        resourceSize: req?.resourceSize ?? null,
        thirdParty: req?.thirdParty ?? null,
        startMs: req?.startMs ?? null,
        durationMs: req?.durationMs ?? null,
        renderBlocking: false,
        blockingMs: null,
        unusedBytes: null,
        unusedPercent: null,
        unminifiedBytes: null,
        selectors: null,
        imports: [],
        media: null,
      });
    }
    return files.get(key);
  };
  for (const r of cssRequests) get(r.url);

  const rb = audit(lhr, 'render-blocking-insight', 'render-blocking-resources');
  for (const it of rows(rb)) {
    const u = urlOf(it);
    if (!u || !/\.css|css2?\?|stylesheet/i.test(u) && !cssRequests.some((r) => sameResource(r.url, u))) continue;
    const f = get(u);
    f.renderBlocking = true;
    f.blockingMs = it.wastedMs ?? null;
  }
  for (const it of rows(audit(lhr, 'unused-css-rules'))) {
    const f = get(urlOf(it));
    f.unusedBytes = it.wastedBytes ?? null;
    f.unusedPercent = it.wastedPercent ?? (it.totalBytes ? (it.wastedBytes / it.totalBytes) * 100 : null);
    f.transferSize ??= it.totalBytes;
  }
  for (const it of rows(audit(lhr, 'unminified-css'))) get(urlOf(it)).unminifiedBytes = it.wastedBytes ?? null;

  // Coverage + parsed stats from Playwright (exact used/unused bytes, selectors, @import, duplicates)
  for (const c of inspection?.coverage?.css || []) {
    if (!c.url || c.url.startsWith('inline')) continue;
    const f = get(c.url);
    if (c.totalBytes) {
      const unused = Math.max(0, c.totalBytes - c.usedBytes);
      if (f.unusedBytes === null) {
        f.unusedBytes = unused;
        f.unusedPercent = (unused / c.totalBytes) * 100;
      }
      f.coverage = { totalBytes: c.totalBytes, usedBytes: c.usedBytes };
    }
    f.selectors = c.selectors ?? f.selectors;
    f.imports = c.imports || [];
    f.duplicateRules = c.duplicateRules ?? 0;
  }
  for (const s of inspection?.stylesheets || []) {
    if (!s.href) continue;
    const f = get(s.href);
    f.media = s.media || null;
    if (f.renderBlocking === false && s.inHead && (!s.media || s.media === 'all' || s.media === 'screen') && !lhr) f.renderBlocking = true;
  }

  const list = [...files.values()].sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));
  const issues = [];
  const rbList = list.filter((f) => f.renderBlocking);
  const rbSav = savings(rb);
  if (rbList.length) {
    const ms = rbSav.ms ?? rbList.reduce((s, f) => s + (f.blockingMs || 0), 0);
    issues.push(makeIssue({
      type: 'css-render-blocking',
      category: 'css',
      title: `Render-blocking stylesheets (${rbList.length})`,
      description: 'These stylesheets block the first paint until they are downloaded and parsed.',
      resource: rbList[0].url,
      why: 'Browsers will not render any content while a <link rel="stylesheet"> in the <head> is pending.',
      impact: 'Delays FCP and LCP (element render delay).',
      metrics: ['FCP', 'LCP'],
      priority: priorityFromSavings({ ms }, { boost: ms > 300 ? 1 : 0 }),
      solution: 'Inline the critical above-the-fold CSS and load the remaining stylesheets asynchronously (preload + onload swap or media="print" swap).',
      evidence: { files: rbList.map((f) => ({ url: f.url, transferSize: f.transferSize, blockingMs: f.blockingMs })) },
      savings: ms ? { ms, source: 'lighthouse' } : null,
    }));
  }
  const unusedList = list.filter((f) => (f.unusedBytes || 0) > 10_000);
  if (unusedList.length) {
    const bytes = unusedList.reduce((s, f) => s + f.unusedBytes, 0);
    issues.push(makeIssue({
      type: 'css-unused',
      category: 'css',
      title: `Unused CSS (${Math.round(bytes / 1024)} KB across ${unusedList.length} file${unusedList.length > 1 ? 's' : ''})`,
      description: 'Rules in these stylesheets were not used while rendering this page.',
      resource: unusedList[0].url,
      why: 'Global theme/framework stylesheets ship CSS for every template and component, even ones not on the page.',
      impact: 'Larger render-blocking downloads and longer style recalculation.',
      metrics: ['FCP', 'LCP'],
      priority: priorityFromSavings({ bytes: bytes * 3 }),
      solution: 'Split CSS per template/component, purge unused selectors at build time (PurgeCSS / Tailwind content config), and load component CSS only where used.',
      evidence: { files: unusedList.map((f) => ({ url: f.url, unusedBytes: f.unusedBytes, unusedPercent: f.unusedPercent, transferSize: f.transferSize })) },
      savings: { bytes, source: inspection?.coverage ? 'measured' : 'lighthouse' },
    }));
  }
  const unminList = list.filter((f) => (f.unminifiedBytes || 0) > 2_000);
  if (unminList.length) {
    const bytes = unminList.reduce((s, f) => s + f.unminifiedBytes, 0);
    issues.push(makeIssue({
      type: 'css-minify',
      category: 'css',
      title: `CSS is not minified (${unminList.length} file${unminList.length > 1 ? 's' : ''})`,
      description: `Minification would save about ${Math.round(bytes / 1024)} KB.`,
      resource: unminList[0].url,
      why: 'Whitespace and comments are shipped to every visitor.',
      impact: 'Larger render-blocking downloads.',
      metrics: ['FCP'],
      priority: priorityFromSavings({ bytes: bytes * 2 }),
      solution: 'Minify CSS in your build (Lightning CSS, cssnano, csso) or enable minification in your CDN/cache plugin.',
      evidence: { files: unminList.map((f) => ({ url: f.url, unminifiedBytes: f.unminifiedBytes })) },
      savings: { bytes, source: 'lighthouse' },
    }));
  }
  const largeList = list.filter((f) => (f.resourceSize || f.transferSize || 0) > 150_000);
  if (largeList.length) {
    issues.push(makeIssue({
      type: 'css-large',
      category: 'css',
      title: `Large stylesheets (${largeList.length})`,
      description: largeList.map((f) => `${f.url.split('/').pop().split('?')[0]} – ${Math.round((f.resourceSize || f.transferSize) / 1024)} KB`).join(', '),
      resource: largeList[0].url,
      why: 'Large stylesheets take longer to download, parse and match against the DOM.',
      impact: 'Delays FCP/LCP and increases style recalculation cost.',
      metrics: ['FCP', 'LCP', 'INP'],
      priority: 'medium',
      solution: 'Split the stylesheet by page type and remove legacy/unused rules.',
      evidence: { files: largeList.map((f) => ({ url: f.url, size: f.resourceSize || f.transferSize })) },
    }));
  }
  const importList = list.filter((f) => f.imports?.length);
  if (importList.length) {
    issues.push(makeIssue({
      type: 'css-import',
      category: 'css',
      title: 'Stylesheets use @import',
      description: importList.map((f) => `${f.url.split('/').pop()} imports ${f.imports.join(', ')}`).join('; '),
      resource: importList[0].url,
      why: '@import creates a serial request chain: the imported file is discovered only after the parent stylesheet downloads.',
      impact: 'Adds a full round trip to render-blocking CSS.',
      metrics: ['FCP', 'LCP'],
      priority: 'high',
      solution: 'Replace @import with separate <link> tags in the HTML (or bundle the files at build time).',
      evidence: { files: importList.map((f) => ({ url: f.url, imports: f.imports })) },
    }));
  }
  const dupList = list.filter((f) => (f.duplicateRules || 0) > 20);
  if (dupList.length) {
    issues.push(makeIssue({
      type: 'css-duplicate',
      category: 'css',
      title: 'Duplicate CSS rules across stylesheets',
      description: dupList.map((f) => `${f.url.split('/').pop()}: ${f.duplicateRules} duplicated rules`).join('; '),
      resource: dupList[0].url,
      why: 'The same rule blocks are shipped in multiple files (often a framework included twice, or a plugin bundling its own copy).',
      impact: 'Wasted bytes in render-blocking CSS.',
      metrics: ['FCP'],
      priority: 'low',
      solution: 'Deduplicate shared styles into one file and remove the second copy of the framework/plugin CSS.',
      evidence: { files: dupList.map((f) => ({ url: f.url, duplicateRules: f.duplicateRules })) },
    }));
  }
  const heavySel = list.filter((f) => (f.selectors || 0) > 4000);
  if (heavySel.length) {
    issues.push(makeIssue({
      type: 'css-selectors',
      category: 'css',
      title: 'Excessive number of CSS selectors',
      description: heavySel.map((f) => `${f.url.split('/').pop()}: ${f.selectors.toLocaleString()} selectors`).join('; '),
      resource: heavySel[0].url,
      why: 'Very large selector counts increase style recalculation time, which affects interactions.',
      impact: 'Slower style recalculation and higher INP.',
      metrics: ['INP', 'TBT'],
      priority: 'low',
      solution: 'Remove unused framework utilities and component styles; scope CSS per template.',
      evidence: { files: heavySel.map((f) => ({ url: f.url, selectors: f.selectors })) },
    }));
  }

  // Critical CSS check: render-blocking CSS present and little inline CSS
  if (rbList.length && (inspection?.inlineStyleBytes ?? 0) < 2_000) {
    issues.push(makeIssue({
      type: 'css-critical',
      category: 'css',
      title: 'No critical (inline) CSS detected',
      description: `The page relies entirely on external stylesheets for first render${inspection ? ` (only ${inspection.inlineStyleBytes || 0} bytes of inline CSS)` : ''}.`,
      resource: rbList[0].url,
      why: 'Without inlined critical CSS the first paint waits for the full stylesheet download.',
      impact: 'Delays FCP and LCP.',
      metrics: ['FCP', 'LCP'],
      priority: 'medium',
      solution: 'Extract above-the-fold CSS (e.g. with the "critical" npm package or Penthouse) and inline it in a <style> tag in the <head>.',
      evidence: { files: rbList.map((f) => ({ url: f.url })) },
    }));
  }

  const fonts = analyzeFonts({ lhr, inspection, requests });
  return {
    files: list,
    totals: {
      count: list.length,
      bytes: list.reduce((s, f) => s + (f.transferSize || 0), 0),
      unusedBytes: list.reduce((s, f) => s + (f.unusedBytes || 0), 0),
      renderBlocking: rbList.length,
      inlineStyleBytes: inspection?.inlineStyleBytes ?? null,
    },
    fonts: fonts.fonts,
    issues: [...issues, ...fonts.issues],
  };
}

function analyzeFonts({ lhr, inspection, requests }) {
  const fontRequests = requests.filter((r) => r.type === 'font');
  const fdAudit = audit(lhr, 'font-display-insight', 'font-display');
  const badDisplay = rows(fdAudit).map((it) => ({ url: urlOf(it), wastedMs: it.wastedMs ?? null }));
  const preloads = (inspection?.preloads || []).filter((p) => p.as === 'font');
  const fonts = fontRequests.map((r) => ({
    url: r.url,
    transferSize: r.transferSize,
    format: (r.url.split('?')[0].split('.').pop() || '').toLowerCase(),
    thirdParty: r.thirdParty,
    preloaded: preloads.some((p) => sameResource(p.href, r.url)) || r.isLinkPreload,
    fontDisplayIssue: badDisplay.some((b) => sameResource(b.url, r.url)),
    startMs: r.startMs,
  }));
  for (const f of inspection?.fonts || []) {
    const m = fonts.find((x) => f.url && sameResource(x.url, f.url));
    if (m) m.family = f.family;
  }
  const issues = [];
  if (badDisplay.length) {
    issues.push(makeIssue({
      type: 'font-display',
      category: 'fonts',
      title: `Web fonts block text rendering (${badDisplay.length})`,
      description: 'These fonts do not use font-display: swap/optional, so text stays invisible while they load (FOIT).',
      resource: badDisplay[0].url,
      why: 'The default font-display (block) hides text for up to 3 seconds.',
      impact: 'Delays FCP and text-based LCP.',
      metrics: ['FCP', 'LCP'],
      priority: 'high',
      solution: 'Add font-display: swap (or optional) to every @font-face; for Google Fonts add &display=swap.',
      evidence: { fonts: badDisplay },
      savings: badDisplay.some((b) => b.wastedMs) ? { ms: Math.max(...badDisplay.map((b) => b.wastedMs || 0)), source: 'lighthouse' } : null,
    }));
  }
  const legacy = fonts.filter((f) => ['ttf', 'otf', 'eot', 'woff'].includes(f.format));
  if (legacy.length) {
    issues.push(makeIssue({
      type: 'font-format',
      category: 'fonts',
      title: `Fonts served in legacy formats (${legacy.length})`,
      description: legacy.map((f) => f.url.split('/').pop()).join(', '),
      resource: legacy[0].url,
      why: 'WOFF2 uses Brotli compression and is ~30% smaller than WOFF and much smaller than TTF/OTF.',
      impact: 'Larger font downloads delay text rendering.',
      metrics: ['FCP', 'LCP'],
      priority: 'medium',
      solution: 'Serve WOFF2 only (supported by all modern browsers).',
      evidence: { fonts: legacy },
    }));
  }
  const critical = fonts.filter((f) => !f.preloaded && !f.thirdParty && f.startMs !== null).sort((a, b) => a.startMs - b.startMs).slice(0, 2);
  if (critical.length && fonts.length && !preloads.length) {
    issues.push(makeIssue({
      type: 'font-preload',
      category: 'fonts',
      title: 'Important fonts are not preloaded',
      description: 'Fonts are discovered only after the CSS that references them is parsed.',
      resource: critical[0].url,
      why: 'Font requests start late because they are nested inside stylesheets.',
      impact: 'Delays text rendering and can cause layout shift when the font swaps.',
      metrics: ['FCP', 'LCP', 'CLS'],
      priority: 'medium',
      solution: 'Preload the 1–2 fonts used above the fold with <link rel="preload" as="font" type="font/woff2" crossorigin>.',
      evidence: { fonts: critical },
    }));
  }
  const gfonts = requests.filter((r) => /fonts\.googleapis\.com/.test(r.url));
  if (gfonts.length && !(inspection?.preconnects || []).some((p) => /fonts\.gstatic\.com/.test(p.href))) {
    issues.push(makeIssue({
      type: 'font-google',
      category: 'fonts',
      title: 'Google Fonts loaded without preconnect',
      description: 'The browser must open connections to fonts.googleapis.com and fonts.gstatic.com before fonts can download.',
      resource: gfonts[0].url,
      why: 'Each third-party origin needs DNS + TCP + TLS before the first request.',
      impact: 'Delays text rendering.',
      metrics: ['FCP', 'LCP'],
      priority: 'low',
      solution: 'Self-host the fonts (best) or add preconnect hints for fonts.gstatic.com with crossorigin.',
      evidence: { urls: gfonts.map((g) => g.url) },
    }));
  }
  return { fonts, issues };
}
