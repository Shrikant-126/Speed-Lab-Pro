// SSRF-safe HTTP client.
// - DNS is resolved inside the socket connect step and every resolved address is checked,
//   which defeats DNS-rebinding between validation and connection.
// - Redirects are followed manually and every hop is re-validated.
// - Hard timeouts and response-size limits are enforced.

import { Agent, fetch as undiciFetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { checkUrlStructure, resolvePublic, normalizeUrl, UnsafeUrlError } from './urlSafety.js';

function safeLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  resolvePublic(hostname.replace(/^\[|\]$/g, ''))
    .then((addresses) => {
      if (opts.all) return cb(null, addresses);
      const first = addresses.find((a) => !opts.family || a.family === opts.family) || addresses[0];
      return cb(null, first.address, first.family);
    })
    .catch((err) => cb(err));
}

export const safeAgent = new Agent({
  connect: { lookup: safeLookup, timeout: 10_000 },
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
  maxRedirections: 0,
});

export const DEFAULT_UA =
  'Mozilla/5.0 (compatible; SpeedLabPro/1.0; +https://github.com/speedlab-pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Fetch a public URL safely.
 * @returns {Promise<{response, url, redirects: Array<{url,status,location}>, timing: {startMs,totalMs,ttfbMs}}>}
 */
export async function safeFetch(input, options = {}) {
  const {
    method = 'GET',
    headers = {},
    maxRedirects = 6,
    timeoutMs = 20_000,
    signal,
  } = options;

  let current = normalizeUrl(typeof input === 'string' ? input : input.toString());
  const redirects = [];
  const started = performance.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    checkUrlStructure(current);
    const hopStart = performance.now();
    const response = await undiciFetch(current.toString(), {
      method,
      headers: { 'user-agent': DEFAULT_UA, accept: '*/*', ...headers },
      redirect: 'manual',
      dispatcher: safeAgent,
      signal: combined,
    });
    const ttfbMs = performance.now() - hopStart;

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      // Drain body so the socket can be reused.
      await response.body?.cancel().catch(() => {});
      if (!location) {
        return { response, url: current.toString(), redirects, timing: { totalMs: performance.now() - started, ttfbMs } };
      }
      const next = new URL(location, current);
      redirects.push({ url: current.toString(), status: response.status, location: next.toString(), ms: Math.round(ttfbMs) });
      current = next;
      continue;
    }
    return {
      response,
      url: current.toString(),
      redirects,
      timing: { totalMs: performance.now() - started, ttfbMs },
    };
  }
  throw new UnsafeUrlError(`Too many redirects (more than ${maxRedirects})`, 'TOO_MANY_REDIRECTS');
}

/** Read a response body with a hard byte limit. */
export async function readLimited(response, maxBytes = 5 * 1024 * 1024) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      await response.body.cancel?.().catch(() => {});
      const err = new Error(`Response exceeded ${Math.round(maxBytes / 1024)} KB limit`);
      err.code = 'TOO_LARGE';
      err.partial = Buffer.concat(chunks);
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export { ipaddr };
