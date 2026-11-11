// Broken link checker: extracts links/resources from a page's HTML and checks them with the
// SSRF-safe client (private/internal addresses are never contacted).

import { safeFetch } from './safeFetch.js';

const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/** Extract unique links and resources from HTML. */
export function extractLinks(html, pageUrl) {
  const page = new URL(pageUrl);
  const map = new Map();
  const add = (raw, type, text = '') => {
    if (!raw) return;
    const v = raw.trim();
    if (!v || /^(mailto|tel|sms|javascript|data|blob|about):/i.test(v)) return;
    let abs;
    try {
      abs = new URL(v, page);
    } catch {
      map.set(`invalid:${v}`, { url: v, type, text, internal: true, invalid: true, count: 1 });
      return;
    }
    if (!/^https?:$/.test(abs.protocol)) return;
    // Same-page anchors (#section) are checked against element ids, not fetched.
    const samePage = abs.origin === page.origin && abs.pathname === page.pathname && abs.search === page.search;
    if (samePage && abs.hash) {
      const key = `anchor:${abs.hash}`;
      if (!map.has(key)) map.set(key, { url: abs.hash, type: 'anchor', text, internal: true, count: 0 });
      map.get(key).count += 1;
      return;
    }
    abs.hash = '';
    const key = abs.toString();
    const e = map.get(key) || { url: key, type, text: text.slice(0, 120), internal: abs.host.replace(/^www\./, '') === page.host.replace(/^www\./, ''), count: 0 };
    e.count += 1;
    if (!e.text && text) e.text = text.slice(0, 120);
    map.set(key, e);
  };

  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) add(attr(`<a${m[1]}>`, 'href'), 'link', strip(m[2]) || attr(`<a${m[1]}>`, 'aria-label') || '');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) add(attr(m[0], 'src') || attr(m[0], 'data-src'), 'image', attr(m[0], 'alt') || '');
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') || '').toLowerCase();
    if (/stylesheet|icon|canonical|alternate|preload/.test(rel)) add(attr(m[0], 'href'), rel.includes('stylesheet') ? 'css' : rel.includes('icon') ? 'icon' : rel, '');
  }
  for (const m of html.matchAll(/<script\b[^>]*\ssrc\s*=[^>]*>/gi)) add(attr(m[0], 'src'), 'script', '');
  for (const m of html.matchAll(/<iframe\b[^>]*>/gi)) add(attr(m[0], 'src'), 'iframe', '');

  // Validate in-page anchors against ids/names in the HTML.
  const ids = new Set([...html.matchAll(/\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)].map((x) => x[1]));
  for (const e of map.values()) {
    if (e.type !== 'anchor') continue;
    const id = decodeURIComponent(e.url.slice(1));
    e.checked = true;
    e.ok = !id || id === 'top' || ids.has(id);
    e.status = e.ok ? 'ok' : 'broken-anchor';
  }
  return [...map.values()];
}

function classify(code) {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 300 && code < 400) return 'redirect';
  if (code === 404 || code === 410) return 'broken';
  if ([401, 403, 429, 999].includes(code)) return 'restricted';
  if (code >= 500) return 'server-error';
  return 'broken';
}

// Sites that reject automated requests (400/403/429/999) even though the page exists.
const BOT_PROTECTED = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|pinterest|threads|reddit|quora|yelp|indeed|glassdoor|crunchbase|g2)\.com$|(^|\.)fb\.me$/i;

async function checkOne(item, { signal, timeoutMs }) {
  const t0 = Date.now();
  if (/\/cdn-cgi\/l\/email-protection/.test(item.url)) {
    return { ...item, checked: true, status: 'skipped', ok: null, error: 'Cloudflare email protection link (decoded by JavaScript in the browser) – not a broken link' };
  }
  const host = (() => {
    try {
      return new URL(item.url).hostname;
    } catch {
      return '';
    }
  })();
  const tryReq = async (method) => {
    const { response, url, redirects } = await safeFetch(item.url, { method, maxRedirects: 6, timeoutMs, signal, headers: { accept: '*/*' } });
    await response.body?.cancel().catch(() => {});
    return { code: response.status, finalUrl: url, redirects };
  };
  try {
    let r;
    try {
      r = await tryReq('HEAD');
      if ([403, 405, 501, 400].includes(r.code)) r = await tryReq('GET');
    } catch (err) {
      if (err.code === 'BLOCKED_IP' || err.code === 'BLOCKED_HOST' || err.code === 'BLOCKED_PORT' || err.code === 'BLOCKED_PROTOCOL') throw err;
      r = await tryReq('GET');
    }
    let status = r.redirects.length && classify(r.code) === 'ok' ? 'redirect' : classify(r.code);
    if (BOT_PROTECTED.test(host) && ['broken', 'restricted'].includes(status) && r.code !== 404 && r.code !== 410) status = 'restricted';
    return { ...item, checked: true, httpStatus: r.code, status, ok: status === 'ok', finalUrl: r.redirects.length ? r.finalUrl : null, redirectHops: r.redirects.length, ms: Date.now() - t0 };
  } catch (err) {
    if (signal?.aborted) throw err;
    const code = err.code || err.cause?.code || err.name;
    let status = 'broken';
    let error = err.message;
    if (/BLOCKED_/.test(code)) {
      status = 'skipped';
      error = 'Not checked: points to a private/internal address';
    } else if (/DNS_FAILED|ENOTFOUND|EAI_AGAIN/.test(code) || /resolve host/i.test(err.message)) {
      error = 'Domain does not resolve (DNS)';
    } else if (/Timeout|ABORT/i.test(code) || /timeout|aborted/i.test(err.message)) {
      status = 'timeout';
      error = `No response within ${Math.round(timeoutMs / 1000)} s`;
    } else if (/CERT|SSL|TLS/i.test(code + err.message)) {
      error = 'TLS/SSL certificate error';
    }
    return { ...item, checked: true, httpStatus: null, status, ok: false, error, ms: Date.now() - t0 };
  }
}

/** Check links with limited concurrency. Internal links first. */
export async function checkLinks(items, { signal, concurrency = 8, timeoutMs = 9000, max = 200 } = {}) {
  const pre = items.filter((i) => i.checked || i.invalid).map((i) => (i.invalid ? { ...i, checked: true, ok: false, status: 'broken', error: 'Malformed URL' } : i));
  const todo = items.filter((i) => !i.checked && !i.invalid).sort((a, b) => b.internal - a.internal || (a.type === 'link' ? -1 : 1));
  const queue = todo.slice(0, max);
  const skipped = todo.slice(max).map((i) => ({ ...i, checked: false, status: 'not-checked', ok: null }));
  const out = [];
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      out.push(await checkOne(queue.shift(), { signal, timeoutMs }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  const results = [...pre, ...out, ...skipped];
  const summary = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  return { results, summary, checked: out.length + pre.length, total: items.length, limited: skipped.length };
}
