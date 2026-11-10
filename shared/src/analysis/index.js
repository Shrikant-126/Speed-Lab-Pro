// Report builder: turns raw collector output into the normalised SpeedLab report.
// Inputs are all optional except url/strategy; missing data is reported as unavailable,
// never fabricated.

import { extractScores, extractLab, extractField } from './metrics.js';
import { extractRequests, summarizeRequests } from './resources.js';
import { analyzeLcp } from './lcp.js';
import { analyzeImages } from './images.js';
import { analyzeVideos } from './videos.js';
import { analyzeCss } from './css.js';
import { analyzeJs } from './javascript.js';
import { analyzeNetwork } from './network.js';
import { analyzeThirdParty } from './thirdParty.js';
import { analyzeCls } from './cls.js';
import { detectPlatform } from './platform.js';
import { analyzeSeo } from './seo.js';
import { PRIORITY_WEIGHT } from '../thresholds.js';

export const REPORT_VERSION = 1;

/**
 * @param {object} input
 * @param {string} input.url               requested URL
 * @param {'mobile'|'desktop'} input.strategy
 * @param {object} [input.psi]             raw PageSpeed Insights response
 * @param {object} [input.lhr]             Lighthouse result (from PSI or local Lighthouse)
 * @param {'psi'|'local'} [input.lighthouseSource]
 * @param {object} [input.crux]            fetchCrux() result
 * @param {object} [input.probe]           probeDocument() result
 * @param {object} [input.inspection]      Playwright inspection result
 * @param {object} [input.imageProbe]      { [url]: { format,width,height,bytes,webpBytes,avifBytes,optimizedBytes } }
 * @param {string[]} [input.warnings]
 */
export function buildReport(input) {
  const { url, strategy, psi, crux, probe, inspection, imageProbe, warnings = [] } = input;
  const lhr = input.lhr || psi?.lighthouseResult || null;
  const finalUrl = lhr?.finalDisplayedUrl || lhr?.finalUrl || probe?.finalUrl || inspection?.finalUrl || url;

  const scores = extractScores(lhr);
  const lab = extractLab(lhr, inspection);
  const field = extractField(psi, crux);

  const { requests } = extractRequests(lhr, inspection, finalUrl);
  const resourceSummary = summarizeRequests(requests);

  const lcp = analyzeLcp({ lhr, inspection, requests, probe, finalUrl, imageProbe, lcpMetricMs: lab.lcp.value });
  const images = analyzeImages({ lhr, inspection, requests, imageProbe, lcpImageUrl: lcp.imageUrl });
  const videos = analyzeVideos({ inspection, requests, lcpElement: lcp.element, viewport: inspection?.viewport });
  const css = analyzeCss({ lhr, inspection, requests });
  const js = analyzeJs({ lhr, inspection, requests });
  const network = analyzeNetwork({ lhr, inspection, probe, requests, labTtfb: lab.ttfb.value, fieldTtfb: field?.metrics?.ttfb?.p75 });
  const thirdParty = analyzeThirdParty({ lhr, requests, inspection });
  const cls = analyzeCls({ lhr, inspection, clsValue: lab.cls.value ?? field?.metrics?.cls?.p75 });
  const platform = detectPlatform({ html: probe?.html || '', headers: probe?.headers || {}, requests });
  const seo = analyzeSeo({ lhr, probe, seoFiles: input.seoFiles, requests, finalUrl, platform });

  const issues = [
    ...lcp.issues,
    ...images.issues,
    ...videos.issues,
    ...css.issues,
    ...js.issues,
    ...network.issues,
    ...thirdParty.issues,
    ...cls.issues,
    ...seo.issues,
  ];
  // Deduplicate by id and sort by priority then savings.
  const seen = new Set();
  const uniqueIssues = issues.filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));
  uniqueIssues.sort(
    (a, b) =>
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      (b.savings?.ms || 0) - (a.savings?.ms || 0) ||
      (b.savings?.bytes || 0) - (a.savings?.bytes || 0),
  );

  const strip = ({ issues: _i, ...rest }) => rest;

  return {
    version: REPORT_VERSION,
    url,
    finalUrl,
    strategy,
    createdAt: new Date().toISOString(),
    sources: {
      lighthouse: lhr ? input.lighthouseSource || 'psi' : null,
      lighthouseVersion: lhr?.lighthouseVersion || null,
      fetchTime: lhr?.fetchTime || null,
      throttling: lhr?.configSettings?.throttlingMethod || null,
      field: field?.source || null,
      pageInspection: inspection ? 'playwright' : null,
      imageProbe: imageProbe && Object.keys(imageProbe).length ? 'sharp' : null,
      documentProbe: probe ? 'probe' : null,
    },
    environment: lhr?.environment
      ? { networkUserAgent: lhr.environment.networkUserAgent, benchmarkIndex: lhr.environment.benchmarkIndex }
      : null,
    scores,
    lab,
    field,
    lcp: strip(lcp),
    images: strip(images),
    videos: strip(videos),
    css: strip(css),
    js: strip(js),
    network: strip(network),
    thirdParty: strip(thirdParty),
    cls: strip(cls),
    seo: strip(seo),
    platform,
    resources: { summary: resourceSummary, requests: requests.slice(0, 400) },
    issues: uniqueIssues,
    issueCounts: uniqueIssues.reduce((acc, i) => ({ ...acc, [i.priority]: (acc[i.priority] || 0) + 1 }), {}),
    warnings,
  };
}

/** Compare two reports (A = before/baseline, B = after). Only measured values are compared. */
export function compareReports(a, b) {
  const delta = (x, y) => (typeof x === 'number' && typeof y === 'number' ? y - x : null);
  const pct = (x, y) => (typeof x === 'number' && typeof y === 'number' && x !== 0 ? ((y - x) / x) * 100 : null);
  const metricKeys = ['lcp', 'fcp', 'ttfb', 'cls', 'tbt', 'si'];
  const metrics = metricKeys.map((k) => ({
    key: k,
    before: a.lab?.[k]?.value ?? null,
    after: b.lab?.[k]?.value ?? null,
    delta: delta(a.lab?.[k]?.value, b.lab?.[k]?.value),
    percent: pct(a.lab?.[k]?.value, b.lab?.[k]?.value),
    // Lower is better for every metric here.
    improved: typeof a.lab?.[k]?.value === 'number' && typeof b.lab?.[k]?.value === 'number' ? b.lab[k].value < a.lab[k].value : null,
  }));
  const scores = ['performance', 'accessibility', 'bestPractices', 'seo'].map((k) => ({
    key: k,
    before: a.scores?.[k] ?? null,
    after: b.scores?.[k] ?? null,
    delta: delta(a.scores?.[k], b.scores?.[k]),
  }));
  const bytes = (r, type) => r.resources?.summary?.byType?.[type]?.bytes ?? null;
  const weights = ['image', 'js', 'css', 'font', 'media', 'document'].map((t) => ({
    key: t,
    before: bytes(a, t),
    after: bytes(b, t),
    delta: delta(bytes(a, t), bytes(b, t)),
    percent: pct(bytes(a, t), bytes(b, t)),
  }));
  weights.push({
    key: 'total',
    before: a.resources?.summary?.bytes ?? null,
    after: b.resources?.summary?.bytes ?? null,
    delta: delta(a.resources?.summary?.bytes, b.resources?.summary?.bytes),
    percent: pct(a.resources?.summary?.bytes, b.resources?.summary?.bytes),
  });
  const ids = (r) => new Set((r.issues || []).map((i) => i.type));
  const aTypes = ids(a);
  const bTypes = ids(b);
  return {
    sameUrl: a.finalUrl === b.finalUrl,
    sameStrategy: a.strategy === b.strategy,
    scores,
    metrics,
    weights,
    issues: {
      resolved: [...aTypes].filter((t) => !bTypes.has(t)),
      introduced: [...bTypes].filter((t) => !aTypes.has(t)),
      before: a.issues?.length ?? 0,
      after: b.issues?.length ?? 0,
    },
    estimatedSavingsBefore: {
      bytes: (a.issues || []).reduce((s, i) => s + (i.savings?.bytes || 0), 0),
      label: 'Estimated (not measured) potential savings identified in the baseline scan',
    },
  };
}

export { detectPlatform } from './platform.js';
export { classifyThirdParty, THIRD_PARTY_CATALOG } from './thirdParty.js';
