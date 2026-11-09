// Core Web Vitals and Lighthouse metric thresholds.
// "good" values follow web.dev guidance; TBT and Speed Index follow Lighthouse mobile scoring.

export const METRICS = {
  lcp: {
    key: 'lcp',
    label: 'Largest Contentful Paint',
    short: 'LCP',
    unit: 'ms',
    good: 2500,
    poor: 4000,
    coreWebVital: true,
    description:
      'Time until the largest image or text block in the viewport is rendered. It reflects how quickly the main content appears.',
    advice: [
      'Make the LCP resource discoverable in the initial HTML (no JS-injected or CSS background hero images).',
      'Add fetchpriority="high" to the LCP image and never lazy-load it.',
      'Serve correctly sized, modern-format (AVIF/WebP) images.',
      'Reduce TTFB and remove render-blocking CSS/JS in the <head>.',
    ],
  },
  fcp: {
    key: 'fcp',
    label: 'First Contentful Paint',
    short: 'FCP',
    unit: 'ms',
    good: 1800,
    poor: 3000,
    description: 'Time until the browser renders the first text, image or non-white canvas.',
    advice: [
      'Eliminate render-blocking stylesheets and synchronous scripts.',
      'Inline critical CSS and load the rest asynchronously.',
      'Use font-display: swap so text renders before web fonts load.',
      'Reduce server response time (TTFB).',
    ],
  },
  ttfb: {
    key: 'ttfb',
    label: 'Time to First Byte',
    short: 'TTFB',
    unit: 'ms',
    good: 800,
    poor: 1800,
    description:
      'Time from the start of navigation until the first byte of the HTML response arrives. Includes redirects, DNS, connection and server processing.',
    advice: [
      'Cache HTML at the edge (CDN) where the page is cacheable.',
      'Remove redirect chains (http→https→www→/path).',
      'Enable HTTP/2 or HTTP/3 and TLS 1.3.',
      'Profile server-side rendering and database queries (requires server access).',
    ],
  },
  cls: {
    key: 'cls',
    label: 'Cumulative Layout Shift',
    short: 'CLS',
    unit: 'score',
    good: 0.1,
    poor: 0.25,
    coreWebVital: true,
    description: 'Measures unexpected layout movement of visible content while the page loads and is used.',
    advice: [
      'Always set width and height (or aspect-ratio) on images, videos and iframes.',
      'Reserve space for ads, embeds and late-loading banners.',
      'Use font-display: optional or size-adjusted fallback fonts to limit font-swap shifts.',
      'Avoid inserting content above existing content after load.',
    ],
  },
  inp: {
    key: 'inp',
    label: 'Interaction to Next Paint',
    short: 'INP',
    unit: 'ms',
    good: 200,
    poor: 500,
    coreWebVital: true,
    fieldOnly: true,
    description:
      'Latency of user interactions (clicks, taps, key presses) until the next frame is painted. Measured only from real users (field data).',
    advice: [
      'Break up long main-thread tasks (yield with scheduler.yield() or setTimeout).',
      'Delay non-essential third-party scripts until after interaction.',
      'Reduce JavaScript execution and hydration cost.',
      'Avoid large, synchronous DOM updates in event handlers.',
    ],
  },
  tbt: {
    key: 'tbt',
    label: 'Total Blocking Time',
    short: 'TBT',
    unit: 'ms',
    good: 200,
    poor: 600,
    labOnly: true,
    description:
      'Sum of the blocking portion of long tasks (>50 ms) between FCP and Time to Interactive. A lab proxy for INP.',
    advice: [
      'Split large bundles with code splitting and dynamic import().',
      'Remove unused JavaScript and duplicated libraries.',
      'Defer third-party scripts until user interaction or idle time.',
    ],
  },
  si: {
    key: 'si',
    label: 'Speed Index',
    short: 'SI',
    unit: 'ms',
    good: 3400,
    poor: 5800,
    labOnly: true,
    description: 'How quickly the visible content of the page is populated during load.',
    advice: [
      'Prioritise above-the-fold content and defer everything else.',
      'Reduce render-blocking resources and main-thread work during load.',
    ],
  },
};

export const METRIC_ORDER = ['lcp', 'fcp', 'ttfb', 'cls', 'inp', 'tbt', 'si'];

/** Rate a metric value: 'good' | 'needs-improvement' | 'poor' | 'unavailable'. */
export function rateMetric(key, value) {
  const m = METRICS[key];
  if (!m || value === null || value === undefined || Number.isNaN(value)) return 'unavailable';
  if (value <= m.good) return 'good';
  if (value <= m.poor) return 'needs-improvement';
  return 'poor';
}

/** Rate a 0–100 Lighthouse category score. */
export function rateScore(score) {
  if (score === null || score === undefined) return 'unavailable';
  if (score >= 90) return 'good';
  if (score >= 50) return 'needs-improvement';
  return 'poor';
}

export const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
