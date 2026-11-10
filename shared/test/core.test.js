import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp, normalizeUrl, checkUrlStructure, validatePublicUrl } from '../src/net/urlSafety.js';
import { buildReport, compareReports } from '../src/analysis/index.js';
import { generateFixes, contextFromReport } from '../src/codegen/index.js';
import { setAttrs } from '../src/codegen/html.js';
import { analyzeProject, applyProject, safeRelativePath } from '../src/upload/index.js';
import { rateMetric } from '../src/thresholds.js';
import JSZip from 'jszip';

test('isPublicIp blocks private, loopback, link-local, metadata and mapped ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '224.0.0.1', '198.18.0.1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('URL structure checks', () => {
  assert.equal(normalizeUrl('example.com').toString(), 'https://example.com/');
  const bad = ['file:///etc/passwd', 'ftp://example.com', 'http://localhost/', 'http://foo.internal/', 'http://user:pw@example.com/', 'http://example.com:22/', 'http://127.0.0.1/', 'http://[::1]/', 'http://intranet/', 'http://169.254.169.254/latest/meta-data'];
  for (const u of bad) assert.throws(() => checkUrlStructure(normalizeUrl(u)), undefined, u);
  assert.doesNotThrow(() => checkUrlStructure(normalizeUrl('https://www.example.com:8443/x')));
});

test('validatePublicUrl rejects hosts resolving to private IPs', async () => {
  // localtest.me and similar resolve to 127.0.0.1; use a literal to avoid network dependence.
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1:80/'));
});

test('thresholds', () => {
  assert.equal(rateMetric('lcp', 2500), 'good');
  assert.equal(rateMetric('lcp', 3000), 'needs-improvement');
  assert.equal(rateMetric('cls', 0.3), 'poor');
  assert.equal(rateMetric('inp', null), 'unavailable');
});

function fixtureLhr() {
  return {
    lighthouseVersion: '12.2.1',
    finalDisplayedUrl: 'https://shop.example.com/',
    categories: { performance: { score: 0.42 }, accessibility: { score: 0.9 }, 'best-practices': { score: 0.78 }, seo: { score: 1 } },
    configSettings: { throttlingMethod: 'simulate' },
    audits: {
      'largest-contentful-paint': { numericValue: 5200 },
      'first-contentful-paint': { numericValue: 2100 },
      'cumulative-layout-shift': { numericValue: 0.21 },
      'total-blocking-time': { numericValue: 740 },
      'speed-index': { numericValue: 4800 },
      'server-response-time': { numericValue: 950 },
      'lcp-breakdown-insight': {
        score: 0,
        details: {
          type: 'list',
          items: [
            { type: 'table', items: [
              { subpart: 'timeToFirstByte', label: 'Time to first byte', duration: 950 },
              { subpart: 'resourceLoadDelay', label: 'Resource load delay', duration: 2600 },
              { subpart: 'resourceLoadDuration', label: 'Resource load duration', duration: 900 },
              { subpart: 'elementRenderDelay', label: 'Element render delay', duration: 750 },
            ] },
            { type: 'node', selector: 'div.hero > img', snippet: '<img src="https://cdn.shopify.com/s/files/hero.jpg" loading="lazy" class="hero__img">', nodeLabel: 'Hero' },
          ],
        },
      },
      'network-requests': { details: { type: 'table', items: [
        { url: 'https://shop.example.com/', resourceType: 'Document', mimeType: 'text/html', transferSize: 40000, networkRequestTime: 0, networkEndTime: 1000, protocol: 'h2' },
        { url: 'https://cdn.shopify.com/s/files/hero.jpg', resourceType: 'Image', mimeType: 'image/jpeg', transferSize: 480000, networkRequestTime: 3500, networkEndTime: 4400, priority: 'Low', protocol: 'h2' },
        { url: 'https://shop.example.com/theme.css', resourceType: 'Stylesheet', mimeType: 'text/css', transferSize: 120000, networkRequestTime: 1000, networkEndTime: 1600, protocol: 'h2' },
        { url: 'https://connect.facebook.net/en_US/fbevents.js', resourceType: 'Script', mimeType: 'application/javascript', transferSize: 90000, networkRequestTime: 1200, networkEndTime: 1700, protocol: 'h2' },
      ] } },
      'render-blocking-insight': { score: 0, metricSavings: { FCP: 600, LCP: 600 }, details: { type: 'table', items: [{ url: 'https://shop.example.com/theme.css', totalBytes: 120000, wastedMs: 600 }] } },
      'unused-css-rules': { score: 0.5, details: { type: 'opportunity', items: [{ url: 'https://shop.example.com/theme.css', totalBytes: 120000, wastedBytes: 90000, wastedPercent: 75 }] } },
      'third-parties-insight': { score: 0, details: { type: 'table', items: [{ entity: 'Facebook', transferSize: 90000, mainThreadTime: 320, subItems: { type: 'subitems', items: [{ url: 'https://connect.facebook.net/en_US/fbevents.js', transferSize: 90000, mainThreadTime: 320 }] } }] } },
    },
  };
}

test('buildReport produces normalised data and evidence-based issues', () => {
  const lhr = fixtureLhr();
  const report = buildReport({
    url: 'https://shop.example.com/',
    strategy: 'mobile',
    psi: { lighthouseResult: lhr, loadingExperience: { metrics: { CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: 'FAST', distributions: [{ proportion: 0.9 }, { proportion: 0.05 }, { proportion: 0.05 }] } } } },
    probe: { html: '<html><script>Shopify.theme = {"name":"My Dawn","schema_name":"Dawn","id":1};</script><link href="//cdn.shopify.com/x.css"></html>', headers: { 'x-shopid': '1' }, finalUrl: 'https://shop.example.com/', redirects: [], timing: { ttfbMs: 900 }, connection: {} },
  });
  assert.equal(report.scores.performance, 42);
  assert.equal(report.lab.lcp.rating, 'poor');
  assert.equal(report.lab.inp.value, null, 'INP is never fabricated in lab data');
  assert.equal(report.field.metrics.cls.p75, 0.05);
  assert.equal(report.field.metrics.lcp.p75, null);
  assert.equal(report.lcp.dominantPhase.key, 'loadDelay');
  assert.equal(report.lcp.imageUrl, 'https://cdn.shopify.com/s/files/hero.jpg');
  assert.equal(report.lcp.checks.lazyLoaded, true);
  assert.equal(report.platform.name, 'shopify');
  assert.equal(report.platform.theme, 'Dawn');
  const types = report.issues.map((i) => i.type);
  for (const t of ['lcp-lazy', 'lcp-fetchpriority', 'css-render-blocking', 'css-unused', 'third-party-delay', 'ttfb']) assert.ok(types.includes(t), `missing ${t}`);
  assert.equal(report.issues[0].priority, 'critical');

  const ctx = contextFromReport(report);
  const lazy = report.issues.find((i) => i.type === 'lcp-lazy');
  const fixes = generateFixes(lazy, ctx);
  const html = fixes.find((f) => f.target === 'html');
  assert.match(html.after, /fetchpriority="high"/);
  assert.match(html.after, /loading="eager"/);
  assert.ok(fixes.some((f) => f.target === 'shopify' && /image_tag/.test(f.after)));
  assert.ok(fixes.some((f) => f.target === 'wordpress'));

  const cmp = compareReports(report, { ...report, lab: { ...report.lab, lcp: { value: 2000 } } });
  assert.equal(cmp.metrics.find((m) => m.key === 'lcp').improved, true);
});

test('setAttrs rewrites only the start tag', () => {
  const out = setAttrs('<img src="a.jpg" loading="lazy">', { loading: 'eager', fetchpriority: 'high' });
  assert.equal(out, '<img src="a.jpg" loading="eager" fetchpriority="high">');
});

test('upload optimizer: path safety, proposals, approval-only application, backup', async () => {
  assert.equal(safeRelativePath('../etc/passwd'), null);
  assert.equal(safeRelativePath('/abs/x.html'), 'abs/x.html');
  const html = '<html><head><script src="app.js"></script><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head><body><img src="a.jpg" loading="lazy"><img src="b.jpg"><img src="c.jpg"><iframe src="https://www.youtube.com/embed/x"></iframe></body></html>';
  const css = '@font-face { font-family: X; src: url(x.woff2); }';
  const files = [{ path: 'index.html', buffer: Buffer.from(html) }, { path: 'style.css', buffer: Buffer.from(css) }];
  const analysis = await analyzeProject(files, { withSharp: false });
  const rules = analysis.changes.map((c) => c.rule);
  for (const r of ['img-first-eager', 'img-lazy', 'script-defer', 'iframe-lazy', 'google-fonts-display', 'font-display']) assert.ok(rules.includes(r), `missing ${r}`);
  const approved = analysis.changes.filter((c) => ['img-lazy', 'font-display', 'script-defer'].includes(c.rule)).map((c) => c.id);
  const { buffer, applied } = await applyProject(files, approved);
  assert.equal(applied.length, approved.length);
  const zip = await JSZip.loadAsync(buffer);
  assert.equal(await zip.file('original/index.html').async('string'), html, 'original preserved');
  const opt = await zip.file('optimized/index.html').async('string');
  assert.match(opt, /<img src="c.jpg" loading="lazy" decoding="async">/);
  assert.match(opt, /<script src="app.js" defer>/);
  assert.match(opt, /<img src="a.jpg" loading="lazy">/, 'unapproved change not applied');
  assert.match(await zip.file('optimized/style.css').async('string'), /font-display: swap/);
  assert.ok(zip.file('CHANGES.md'));
});

test('SEO & analytics validation from HTML', async () => {
  const { analyzeSeo } = await import('../src/analysis/seo.js');
  const html = `<!doctype html><html><head><title>Hi</title>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];})(window,document,'script','dataLayer','GTM-ABC1234');</script>
  <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>
  <script>dataLayer = [{page:'x'}];</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Shoe","offers":{"@type":"Offer","price":"10"}}</script>
  <script type="application/ld+json">{bad json}</script>
  <meta name="robots" content="noindex"></head><body><h1>A</h1><h1>B</h1><h4>C</h4><img src="a.jpg"><a href="#">x</a></body></html>`;
  const s = analyzeSeo({ probe: { html, headers: {}, statusCode: 200 }, seoFiles: null, requests: [], finalUrl: 'https://shop.example.com/p', platform: null });
  const byId = Object.fromEntries([...s.checks, ...s.tagChecks].map((c) => [c.id, c]));
  assert.equal(byId.indexable.status, 'fail', 'noindex detected');
  assert.equal(byId['meta-description'].status, 'fail');
  assert.equal(byId.h1.status, 'warn', 'two H1s');
  assert.equal(byId.title.status, 'warn', 'too short');
  assert.equal(byId['structured-data'].status, 'fail', 'invalid JSON + missing priceCurrency');
  assert.ok(s.structuredData.blocks[0].nodes[0].errors.some((e) => /priceCurrency/.test(e)));
  assert.deepEqual(s.analytics.gtm, ['GTM-ABC1234']);
  assert.equal(byId.datalayer.status, 'fail', 'dataLayer reset after GTM');
  assert.equal(byId['gtm-install'].status, 'warn', 'noscript missing');
  assert.ok(s.issues.some((i) => i.type === 'seo-indexable' && i.priority === 'critical'));
});
