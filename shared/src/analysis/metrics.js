// Category scores, lab metrics and field (real-user) metrics.

import { audit, numeric } from './lhr.js';
import { rateMetric } from '../thresholds.js';

export function extractScores(lhr) {
  const c = lhr?.categories || {};
  const pick = (k) => (typeof c[k]?.score === 'number' ? Math.round(c[k].score * 100) : null);
  return {
    performance: pick('performance'),
    accessibility: pick('accessibility'),
    bestPractices: pick('best-practices'),
    seo: pick('seo'),
  };
}

function metric(key, value) {
  return { value: value === null || value === undefined ? null : value, rating: rateMetric(key, value) };
}

export function extractLab(lhr, inspection) {
  const metricsItem = audit(lhr, 'metrics')?.details?.items?.[0] || {};
  let ttfb = numeric(lhr, 'server-response-time');
  let ttfbObserved = false;
  if (ttfb === null && typeof metricsItem.timeToFirstByte === 'number') {
    ttfb = metricsItem.timeToFirstByte;
    ttfbObserved = true;
  }
  // document-latency-insight exposes the server response time in its debug data in some versions.
  if (ttfb === null) {
    const dl = audit(lhr, 'document-latency-insight');
    const v = dl?.details?.debugData?.serverResponseTime ?? dl?.details?.items?.serverResponseTime;
    if (typeof v === 'number') ttfb = v;
  }
  const lab = {
    lcp: metric('lcp', numeric(lhr, 'largest-contentful-paint')),
    fcp: metric('fcp', numeric(lhr, 'first-contentful-paint')),
    ttfb: {
      ...metric('ttfb', ttfb),
      note: ttfbObserved ? "Observed on Google's Lighthouse server (unthrottled, often near zero). Compare with field TTFB and the Network page." : null,
    },
    cls: metric('cls', numeric(lhr, 'cumulative-layout-shift')),
    tbt: metric('tbt', numeric(lhr, 'total-blocking-time')),
    si: metric('si', numeric(lhr, 'speed-index')),
    inp: { value: null, rating: 'unavailable', note: 'INP cannot be measured in a lab page load; see field data.' },
    tti: numeric(lhr, 'interactive'),
  };
  if (!lhr && inspection?.navigation) {
    // Without Lighthouse we can still report TTFB/FCP/LCP observed by the Playwright run (unthrottled).
    lab.ttfb = metric('ttfb', inspection.navigation.ttfb ?? null);
    lab.fcp = metric('fcp', inspection.paint?.fcp ?? null);
    lab.lcp = metric('lcp', inspection.lcp?.time ?? null);
    lab.cls = metric('cls', inspection.cls?.value ?? null);
    lab.source = 'playwright-unthrottled';
  }
  return lab;
}

const PSI_FIELD_KEYS = {
  lcp: 'LARGEST_CONTENTFUL_PAINT_MS',
  fcp: 'FIRST_CONTENTFUL_PAINT_MS',
  cls: 'CUMULATIVE_LAYOUT_SHIFT_SCORE',
  inp: 'INTERACTION_TO_NEXT_PAINT',
  ttfb: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE',
};

const CRUX_KEYS = {
  lcp: 'largest_contentful_paint',
  fcp: 'first_contentful_paint',
  cls: 'cumulative_layout_shift',
  inp: 'interaction_to_next_paint',
  ttfb: 'experimental_time_to_first_byte',
};

function fromCrux(crux) {
  const m = crux.record.metrics || {};
  const metrics = {};
  for (const [k, ck] of Object.entries(CRUX_KEYS)) {
    const entry = m[ck];
    if (!entry) {
      metrics[k] = { p75: null, rating: 'unavailable', distribution: null };
      continue;
    }
    const p75 = entry.percentiles?.p75 === undefined ? null : Number(entry.percentiles.p75);
    const hist = entry.histogram || [];
    metrics[k] = {
      p75,
      rating: rateMetric(k, p75),
      distribution: hist.length === 3 ? { good: hist[0].density ?? 0, ni: hist[1].density ?? 0, poor: hist[2].density ?? 0 } : null,
    };
  }
  const p = crux.record.collectionPeriod;
  const fmt = (d) => (d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);
  return {
    source: 'crux-api',
    scope: crux.scope,
    collectionPeriod: p ? { start: fmt(p.firstDate), end: fmt(p.lastDate) } : null,
    metrics,
  };
}

function fromPsi(le, scope) {
  const metrics = {};
  for (const [k, pk] of Object.entries(PSI_FIELD_KEYS)) {
    const entry = le.metrics?.[pk];
    if (!entry) {
      metrics[k] = { p75: null, rating: 'unavailable', distribution: null };
      continue;
    }
    let p75 = entry.percentile ?? null;
    if (k === 'cls' && p75 !== null) p75 /= 100; // PSI reports CLS ×100
    const d = entry.distributions || [];
    metrics[k] = {
      p75,
      rating: rateMetric(k, p75),
      distribution: d.length === 3 ? { good: d[0].proportion ?? 0, ni: d[1].proportion ?? 0, poor: d[2].proportion ?? 0 } : null,
    };
  }
  return {
    source: 'pagespeed-crux',
    scope,
    overall: le.overall_category || null,
    collectionPeriod: null,
    metrics,
  };
}

/** Field data: prefer direct CrUX API (has collection period), fall back to the PSI loadingExperience. */
export function extractField(psi, crux) {
  if (crux?.record) return fromCrux(crux);
  const le = psi?.loadingExperience;
  if (le?.metrics && Object.keys(le.metrics).length) {
    return fromPsi(le, le.origin_fallback ? 'origin' : 'url');
  }
  const ole = psi?.originLoadingExperience;
  if (ole?.metrics && Object.keys(ole.metrics).length) return fromPsi(ole, 'origin');
  return null;
}
