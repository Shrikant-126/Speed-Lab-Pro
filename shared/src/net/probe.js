// Document probe: measures connection phases from the scanner's location, follows the
// redirect chain, and inspects response headers (compression, caching, CDN, protocol).
// It also returns the HTML (size-limited) for platform detection and static analysis.

import net from 'node:net';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';
import { safeFetch, readLimited } from './safeFetch.js';
import { resolvePublic, normalizeUrl } from './urlSafety.js';

const CDN_SIGNATURES = [
  { name: 'Cloudflare', test: (h) => h.has('cf-ray') || /cloudflare/i.test(h.get('server') || '') },
  { name: 'Fastly', test: (h) => /fastly/i.test(h.get('x-served-by') || '') || h.has('x-fastly-request-id') },
  { name: 'Amazon CloudFront', test: (h) => h.has('x-amz-cf-id') || /cloudfront/i.test(h.get('via') || '') },
  { name: 'Akamai', test: (h) => /akamai/i.test(h.get('server') || '') || h.has('x-akamai-transformed') },
  { name: 'Vercel', test: (h) => h.has('x-vercel-id') },
  { name: 'Netlify', test: (h) => h.has('x-nf-request-id') || /netlify/i.test(h.get('server') || '') },
  { name: 'Shopify CDN', test: (h) => h.has('x-shopid') || h.has('x-shopify-stage') },
  { name: 'Google Cloud CDN', test: (h) => /google/i.test(h.get('via') || '') || h.get('server') === 'gws' },
  { name: 'Azure Front Door', test: (h) => h.has('x-azure-ref') },
  { name: 'Bunny CDN', test: (h) => /bunnycdn/i.test(h.get('server') || '') },
  { name: 'Sucuri', test: (h) => h.has('x-sucuri-id') },
  { name: 'KeyCDN', test: (h) => /keycdn/i.test(h.get('server') || '') },
  { name: 'LiteSpeed / QUIC.cloud', test: (h) => h.has('x-qc-cache') || h.has('x-qc-pop') },
  { name: 'Kinsta CDN', test: (h) => h.has('ki-cf-cache-status') || h.has('x-kinsta-cache') },
  { name: 'WP Engine', test: (h) => h.has('wpe-backend') || h.has('x-wpe-loopback-upstream-addr') },
];

/** Time DNS, TCP and TLS separately with raw sockets (connects to a validated public IP). */
export async function measureConnection(urlString, timeoutMs = 8000) {
  const url = new URL(urlString);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const result = { dnsMs: null, tcpMs: null, tlsMs: null, ip: null, tlsVersion: null, alpn: null, error: null };

  const t0 = performance.now();
  let addresses;
  try {
    addresses = await resolvePublic(host);
  } catch (err) {
    result.error = err.message;
    return result;
  }
  result.dnsMs = Math.round(performance.now() - t0);
  const { address, family } = addresses[0];
  result.ip = address;

  await new Promise((resolve) => {
    const t1 = performance.now();
    const socket = net.connect({ host: address, port, family });
    const timer = setTimeout(() => {
      result.error = 'Connection timed out';
      socket.destroy();
      resolve();
    }, timeoutMs);
    socket.once('error', (err) => {
      clearTimeout(timer);
      result.error = err.message;
      resolve();
    });
    socket.once('connect', () => {
      result.tcpMs = Math.round(performance.now() - t1);
      if (url.protocol !== 'https:') {
        clearTimeout(timer);
        socket.destroy();
        resolve();
        return;
      }
      const t2 = performance.now();
      const secure = tls.connect({ socket, servername: host, ALPNProtocols: ['h2', 'http/1.1'] });
      secure.once('secureConnect', () => {
        clearTimeout(timer);
        result.tlsMs = Math.round(performance.now() - t2);
        result.tlsVersion = secure.getProtocol();
        result.alpn = secure.alpnProtocol || null;
        secure.destroy();
        resolve();
      });
      secure.once('error', (err) => {
        clearTimeout(timer);
        result.error = `TLS: ${err.message}`;
        secure.destroy();
        resolve();
      });
    });
  });
  return result;
}

function parseCacheControl(value) {
  const out = {};
  if (!value) return out;
  for (const part of value.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k) out[k.toLowerCase()] = v === undefined ? true : v.replace(/"/g, '');
  }
  return out;
}

function robotsBlocks(robotsTxt, path) {
  // Evaluate the most specific group for Googlebot, else "*". Longest matching rule wins.
  const groups = [];
  let current = null;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(val.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const pick = groups.find((g) => g.agents.includes('googlebot')) || groups.find((g) => g.agents.includes('*'));
  if (!pick) return { blocksAll: false, blocksPage: false, matchedRule: null };
  const toRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  let best = null;
  for (const r of pick.rules) {
    if (!r.path) continue;
    if (toRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return {
    blocksAll: pick.rules.some((r) => !r.allow && r.path === '/') && !pick.rules.some((r) => r.allow && r.path === '/'),
    blocksPage: !!best && !best.allow,
    matchedRule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null,
  };
}

/** Fetch robots.txt and the XML sitemap for SEO checks. Never throws. */
export async function probeSeoFiles(pageUrl, { signal } = {}) {
  const u = new URL(pageUrl);
  const origin = u.origin;
  const out = { robots: null, sitemap: null };
  try {
    const { response } = await safeFetch(`${origin}/robots.txt`, { signal, timeoutMs: 10_000, maxRedirects: 3, headers: { accept: 'text/plain,*/*' } });
    const text = response.ok ? (await readLimited(response, 512 * 1024)).toString('utf8') : (await response.body?.cancel().catch(() => {}), '');
    const sitemaps = [...text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
    out.robots = { status: response.status, bytes: text.length, sitemaps, ...robotsBlocks(text, u.pathname + u.search), excerpt: text.slice(0, 1500) };
  } catch (err) {
    out.robots = { status: 0, error: err.message, sitemaps: [], blocksAll: false, blocksPage: false };
  }
  const candidates = [...new Set([...(out.robots?.sitemaps || []), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`])].slice(0, 4);
  for (const sm of candidates) {
    try {
      const { response, url } = await safeFetch(sm, { signal, timeoutMs: 12_000, maxRedirects: 3, headers: { accept: 'application/xml,text/xml,*/*' } });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        out.sitemap ||= { url: sm, ok: false, status: response.status };
        continue;
      }
      let xml;
      try {
        xml = (await readLimited(response, 5 * 1024 * 1024)).toString('utf8');
      } catch (e) {
        xml = e.partial ? e.partial.toString('utf8') : '';
      }
      const isIndex = /<sitemapindex\b/i.test(xml);
      const count = (xml.match(isIndex ? /<sitemap>/gi : /<url>/gi) || []).length;
      if (/<(urlset|sitemapindex)\b/i.test(xml)) {
        out.sitemap = { url, ok: count > 0, status: response.status, isIndex, count, error: count ? null : 'Sitemap has no entries' };
        break;
      }
      out.sitemap ||= { url, ok: false, status: response.status, error: 'Not an XML sitemap' };
    } catch (err) {
      out.sitemap ||= { url: sm, ok: false, status: 0, error: err.message };
    }
  }
  return out;
}

/** Probe the document URL. Never throws for HTTP errors; throws only for unsafe URLs. */
export async function probeDocument(inputUrl, { signal, mobile = true } = {}) {
  const url = normalizeUrl(inputUrl).toString();
  const ua = mobile
    ? 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 SpeedLabPro/1.0'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 SpeedLabPro/1.0';

  const connection = await measureConnection(url);
  const started = performance.now();
  const { response, url: finalUrl, redirects, timing } = await safeFetch(url, {
    signal,
    headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'br, gzip, deflate' },
    timeoutMs: 25_000,
  });

  let html = '';
  let htmlBytes = null;
  let truncated = false;
  try {
    const buf = await readLimited(response, 4 * 1024 * 1024);
    htmlBytes = buf.length;
    html = buf.toString('utf8');
  } catch (err) {
    if (err.code === 'TOO_LARGE') {
      truncated = true;
      html = err.partial.toString('utf8');
      htmlBytes = err.partial.length;
    } else throw err;
  }
  const totalMs = Math.round(performance.now() - started);
  const h = response.headers;
  const cacheControl = h.get('cache-control');
  const cc = parseCacheControl(cacheControl);
  const cdn = CDN_SIGNATURES.filter((s) => s.test(h)).map((s) => s.name);
  const cacheStatus =
    h.get('cf-cache-status') || h.get('x-cache') || h.get('x-vercel-cache') || h.get('x-litespeed-cache') ||
    h.get('x-qc-cache') || h.get('x-cache-status') || h.get('x-proxy-cache') || null;

  const headers = {};
  for (const [k, v] of h.entries()) {
    if (!/^set-cookie$/i.test(k)) headers[k] = v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }

  return {
    requestedUrl: url,
    finalUrl,
    statusCode: response.status,
    redirects,
    connection,
    timing: {
      // Time from request to first byte of the final document (excluding the redirect hops above).
      ttfbMs: Math.round(timing.ttfbMs),
      totalMs,
      redirectMs: redirects.reduce((s, r) => s + (r.ms || 0), 0),
    },
    compression: h.get('content-encoding') || null,
    contentType: h.get('content-type') || null,
    htmlBytes,
    htmlTruncated: truncated,
    cacheControl,
    cacheDirectives: cc,
    cacheStatus,
    age: h.get('age'),
    server: h.get('server') || null,
    poweredBy: h.get('x-powered-by') || null,
    altSvc: h.get('alt-svc') || null,
    http3Advertised: /h3/.test(h.get('alt-svc') || ''),
    cdn,
    headers,
    html,
  };
}
