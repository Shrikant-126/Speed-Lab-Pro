// Google PageSpeed Insights v5 and Chrome UX Report (CrUX) API clients.
// Both APIs are called with plain fetch – the target is Google, not user-controlled.

export class PageSpeedError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'PageSpeedError';
    this.status = status;
    this.code = code || 'PAGESPEED_ERROR';
  }
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

/**
 * Run PageSpeed Insights (Lighthouse on Google infrastructure + CrUX field data).
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 */
export async function runPageSpeed(url, strategy, { apiKey, signal, timeoutMs = 150_000, locale = 'en' } = {}) {
  const params = new URLSearchParams({ url, strategy, locale });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) params.append('category', c);
  if (apiKey) params.set('key', apiKey);

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res;
  try {
    res = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: combined, headers: { accept: 'application/json' } });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err.name === 'TimeoutError' || timeout.aborted) {
      throw new PageSpeedError('PageSpeed Insights did not respond within the time limit', 504, 'PSI_TIMEOUT');
    }
    throw new PageSpeedError(`Could not reach PageSpeed Insights: ${err.message}`, 502, 'PSI_NETWORK');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error?.message || `PageSpeed Insights returned HTTP ${res.status}`;
    let code = 'PSI_ERROR';
    if (res.status === 429) code = 'PSI_QUOTA';
    else if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_FCP/i.test(msg)) code = 'PSI_PAGE_FAILED';
    const hint =
      res.status === 429
        ? ' — the anonymous quota is exhausted. Set PAGESPEED_API_KEY to raise the quota.'
        : '';
    throw new PageSpeedError(msg + hint, res.status, code);
  }
  if (body?.lighthouseResult?.runtimeError?.code && body.lighthouseResult.runtimeError.code !== 'NO_ERROR') {
    const re = body.lighthouseResult.runtimeError;
    throw new PageSpeedError(`Lighthouse runtime error: ${re.message || re.code}`, 422, 'LH_RUNTIME');
  }
  return body;
}

const CRUX_METRICS = [
  'largest_contentful_paint',
  'first_contentful_paint',
  'cumulative_layout_shift',
  'interaction_to_next_paint',
  'experimental_time_to_first_byte',
];

async function queryCrux(body, apiKey, signal) {
  const res = await fetch(`${CRUX_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, metrics: CRUX_METRICS }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null; // No field data for this URL/origin
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || `CrUX API returned HTTP ${res.status}`);
  return json?.record || null;
}

/**
 * Query CrUX for URL-level data, falling back to origin-level data.
 * Returns { scope: 'url'|'origin', record } or null when no field data exists.
 */
export async function fetchCrux(url, strategy, { apiKey, signal } = {}) {
  if (!apiKey) return null;
  const formFactor = strategy === 'desktop' ? 'DESKTOP' : 'PHONE';
  const urlRecord = await queryCrux({ url, formFactor }, apiKey, signal);
  if (urlRecord) return { scope: 'url', record: urlRecord };
  const origin = new URL(url).origin;
  const originRecord = await queryCrux({ origin, formFactor }, apiKey, signal);
  if (originRecord) return { scope: 'origin', record: originRecord };
  return null;
}
