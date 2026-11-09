// Server / TTFB / network analysis. Uses the document probe (real measurements from the
// scanner location), Playwright navigation timing, and Lighthouse network audits.
// NOTE: from a public URL we can only observe symptoms (slow TTFB, missing cache headers);
// we never claim to know backend causes such as database queries.

import { audit, rows, urlOf, checklist, numeric } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

const TEXT_TYPES = new Set(['document', 'css', 'js', 'xhr']);

export function analyzeNetwork({ lhr, inspection, probe, requests, labTtfb, fieldTtfb }) {
  const issues = [];
  const nav = inspection?.navigation || null;
  const conn = probe?.connection || null;

  const timing = {
    source: nav ? 'playwright' : conn ? 'probe' : null,
    dnsMs: nav?.dns ?? conn?.dnsMs ?? null,
    tcpMs: nav?.tcp ?? conn?.tcpMs ?? null,
    tlsMs: nav?.tls ?? conn?.tlsMs ?? null,
    requestToFirstByteMs: nav?.serverWait ?? null,
    ttfbMs: nav?.ttfb ?? (probe ? probe.timing.ttfbMs + (probe.timing.redirectMs || 0) : null),
    downloadMs: nav?.download ?? null,
    redirectMs: nav?.redirectTime ?? probe?.timing?.redirectMs ?? null,
    domContentLoadedMs: nav?.domContentLoaded ?? null,
    loadMs: nav?.load ?? null,
  };

  // Redirects
  let redirects = probe?.redirects || [];
  if (!redirects.length) {
    redirects = rows(audit(lhr, 'redirects')).map((r) => ({ url: urlOf(r), ms: r.wastedMs }));
  }
  const docLatency = checklist(audit(lhr, 'document-latency-insight'));
  if (redirects.length || docLatency.noRedirects?.value === false) {
    const ms = redirects.reduce((s, r) => s + (r.ms || 0), 0);
    issues.push(makeIssue({
      type: 'redirects',
      category: 'server',
      title: `Redirect chain before the page loads (${redirects.length || 1} hop${redirects.length === 1 ? '' : 's'})`,
      description: redirects.map((r) => `${r.url} → ${r.location || ''} (${r.status || ''})`).join('\n'),
      resource: redirects[0]?.url || probe?.requestedUrl,
      why: 'Every redirect costs a full round trip (and often a new connection) before the HTML can start downloading.',
      impact: 'Adds directly to TTFB, FCP and LCP.',
      metrics: ['TTFB', 'FCP', 'LCP'],
      priority: priorityFromSavings({ ms: ms || 300 }, { boost: 1 }),
      solution: 'Link directly to the final URL (correct scheme, host and trailing slash) and collapse multiple redirects into one.',
      evidence: { redirects, finalUrl: probe?.finalUrl },
      savings: ms ? { ms, source: 'measured' } : null,
    }));
  }

  // TTFB
  const ttfb = labTtfb ?? timing.ttfbMs;
  const slowServer = docLatency.serverResponseIsFast?.value === false || (ttfb !== null && ttfb > 800) || (fieldTtfb && fieldTtfb > 800);
  if (slowServer) {
    const cached = probe?.cacheStatus && /hit/i.test(probe.cacheStatus);
    issues.push(makeIssue({
      type: 'ttfb',
      category: 'server',
      title: `Slow server response (TTFB ${Math.round(ttfb ?? fieldTtfb ?? 0)} ms)`,
      description: [
        timing.dnsMs !== null ? `DNS ${timing.dnsMs} ms` : null,
        timing.tcpMs !== null ? `TCP ${timing.tcpMs} ms` : null,
        timing.tlsMs !== null ? `TLS ${timing.tlsMs} ms` : null,
        probe?.cacheStatus ? `Cache status: ${probe.cacheStatus}` : 'No CDN cache-status header observed',
        probe?.cdn?.length ? `CDN: ${probe.cdn.join(', ')}` : 'No CDN detected from headers',
      ].filter(Boolean).join(' · '),
      resource: probe?.finalUrl,
      why: cached
        ? 'The response was served from cache but is still slow, which points to network distance or connection setup.'
        : 'The HTML does not appear to be served from an edge cache, so every request waits for the origin to generate the page. The underlying cause (application code, database, hosting resources) cannot be determined from outside — profile the server to confirm.',
      impact: 'TTFB is a floor for FCP and LCP.',
      metrics: ['TTFB', 'FCP', 'LCP'],
      priority: (ttfb ?? 0) > 1800 ? 'critical' : 'high',
      solution: 'Enable full-page/edge caching for anonymous traffic, use a CDN close to users, upgrade to HTTP/2+/TLS 1.3, and profile slow server-side code paths.',
      evidence: { timing, cdn: probe?.cdn, cacheStatus: probe?.cacheStatus, server: probe?.server, cacheControl: probe?.cacheControl },
    }));
  }

  // Compression
  const uncompressed = rows(audit(lhr, 'uses-text-compression')).map((r) => ({ url: urlOf(r), wastedBytes: r.wastedBytes, totalBytes: r.totalBytes }));
  if (probe && !probe.compression && (probe.htmlBytes || 0) > 1400) {
    uncompressed.unshift({ url: probe.finalUrl, wastedBytes: Math.round(probe.htmlBytes * 0.7), totalBytes: probe.htmlBytes, estimated: true });
  }
  if (uncompressed.length || docLatency.usesCompression?.value === false) {
    const bytes = uncompressed.reduce((s, r) => s + (r.wastedBytes || 0), 0);
    issues.push(makeIssue({
      type: 'compression',
      category: 'network',
      title: `Text resources served without compression (${uncompressed.length || 1})`,
      description: 'HTML, CSS and JavaScript should be served with Brotli or gzip.',
      resource: uncompressed[0]?.url || probe?.finalUrl,
      why: 'Uncompressed text resources are typically 3–5× larger over the wire.',
      impact: 'Slower downloads of render-critical resources.',
      metrics: ['FCP', 'LCP'],
      priority: priorityFromSavings({ bytes: bytes * 2 }, { boost: 1 }),
      solution: 'Enable Brotli (preferred) and gzip on the server or CDN for text/html, text/css, application/javascript, application/json and image/svg+xml.',
      evidence: { files: uncompressed.slice(0, 20), server: probe?.server },
      savings: bytes ? { bytes, source: uncompressed.some((u) => u.estimated) ? 'estimate' : 'lighthouse' } : null,
    }));
  }

  // Static asset caching
  const cacheRows = rows(audit(lhr, 'cache-insight', 'uses-long-cache-ttl'))
    .map((r) => ({ url: urlOf(r), ttlMs: r.cacheLifetimeMs ?? null, totalBytes: r.totalBytes, wastedBytes: r.wastedBytes }))
    .filter((r) => r.url);
  if (cacheRows.length) {
    const bytes = cacheRows.reduce((s, r) => s + (r.totalBytes || 0), 0);
    const firstParty = cacheRows.filter((r) => !requests.find((q) => q.url === r.url)?.thirdParty);
    issues.push(makeIssue({
      type: 'cache-headers',
      category: 'network',
      title: `Static assets with short cache lifetimes (${cacheRows.length})`,
      description: `${firstParty.length} first-party and ${cacheRows.length - firstParty.length} third-party resources; ${Math.round(bytes / 1024)} KB re-downloaded on repeat visits.`,
      resource: (firstParty[0] || cacheRows[0]).url,
      why: 'Without long max-age caching, returning visitors re-download (or revalidate) the same files.',
      impact: 'Slower repeat visits and navigations.',
      metrics: ['LCP (repeat views)'],
      priority: firstParty.length ? priorityFromSavings({ bytes: bytes / 2 }) : 'low',
      solution: 'Serve fingerprinted static assets with Cache-Control: public, max-age=31536000, immutable.',
      evidence: { files: cacheRows.slice(0, 30) },
    }));
  }

  // HTML caching headers
  if (probe && probe.cacheDirectives && (probe.cacheDirectives['no-store'] || probe.cacheDirectives.private) && slowServer) {
    issues.push(makeIssue({
      type: 'html-cache',
      category: 'server',
      title: 'HTML is marked uncacheable',
      description: `Cache-Control: ${probe.cacheControl}`,
      resource: probe.finalUrl,
      why: 'no-store/private prevents CDNs from caching the document, so every visitor waits for the origin.',
      impact: 'Higher TTFB for all visitors.',
      metrics: ['TTFB', 'LCP'],
      priority: 'medium',
      solution: 'If the page is the same for anonymous visitors, allow edge caching (e.g. Cache-Control: public, s-maxage=600, stale-while-revalidate=86400) and bypass cache only for logged-in/cart sessions.',
      evidence: { cacheControl: probe.cacheControl, cacheStatus: probe.cacheStatus },
    }));
  }

  // Protocol
  const docReq = requests.find((r) => r.type === 'document');
  const h1 = requests.filter((r) => r.protocol === 'http/1.1' && !r.thirdParty);
  const modernHttp = audit(lhr, 'modern-http-insight', 'uses-http2');
  if ((h1.length > 5) || (modernHttp && rows(modernHttp).length)) {
    issues.push(makeIssue({
      type: 'http2',
      category: 'network',
      title: `First-party resources served over HTTP/1.1 (${h1.length || rows(modernHttp).length})`,
      description: 'HTTP/2 and HTTP/3 multiplex many requests over one connection.',
      resource: (h1[0] || {}).url || urlOf(rows(modernHttp)[0]),
      why: 'HTTP/1.1 limits parallel downloads per connection, queuing requests.',
      impact: 'Slower loading of pages with many resources.',
      metrics: ['LCP', 'Speed Index'],
      priority: 'medium',
      solution: 'Enable HTTP/2 (and HTTP/3/QUIC where available) on your server or CDN.',
      evidence: { files: h1.slice(0, 20).map((r) => r.url) },
    }));
  }

  // Third-party origins without preconnect for critical early requests
  const preconnects = new Set((inspection?.preconnects || []).map((p) => { try { return new URL(p.href).origin; } catch { return p.href; } }));
  const earlyOrigins = new Map();
  for (const r of requests) {
    if (!r.thirdParty || r.startMs > 1500 || !['css', 'font', 'image', 'js'].includes(r.type)) continue;
    try {
      const o = new URL(r.url).origin;
      earlyOrigins.set(o, (earlyOrigins.get(o) || 0) + 1);
    } catch { /* ignore */ }
  }
  const needPreconnect = [...earlyOrigins.keys()].filter((o) => !preconnects.has(o)).slice(0, 4);
  if (inspection && needPreconnect.length && requests.some((r) => r.type === 'image' || r.type === 'font')) {
    issues.push(makeIssue({
      type: 'preconnect',
      category: 'network',
      title: `Critical third-party origins without preconnect (${needPreconnect.length})`,
      description: needPreconnect.join(', '),
      resource: needPreconnect[0],
      why: 'Connection setup (DNS + TCP + TLS) for each new origin happens only when the first request is made.',
      impact: 'Delays early resources from those origins.',
      metrics: ['FCP', 'LCP'],
      priority: 'low',
      solution: 'Add <link rel="preconnect"> for at most 2–4 origins that serve render-critical resources (fonts, hero image CDN).',
      evidence: { origins: needPreconnect },
    }));
  }

  // Page weight
  const totalBytes = numeric(lhr, 'total-byte-weight') ?? requests.reduce((s, r) => s + (r.transferSize || 0), 0);
  if (totalBytes > 3_000_000) {
    issues.push(makeIssue({
      type: 'page-weight',
      category: 'network',
      title: `Large page weight (${(totalBytes / 1048576).toFixed(1)} MB)`,
      description: 'Large pages are slow on mobile networks and expensive for users on metered data.',
      resource: probe?.finalUrl,
      why: 'Usually caused by unoptimised images/videos and large JavaScript bundles.',
      impact: 'Affects LCP and Speed Index on slow connections.',
      metrics: ['LCP', 'Speed Index'],
      priority: totalBytes > 6_000_000 ? 'high' : 'medium',
      solution: 'Address the image, video and JavaScript issues in this report; target < 1.5 MB for mobile landing pages.',
      evidence: { totalBytes },
    }));
  }

  return {
    document: probe
      ? {
          requestedUrl: probe.requestedUrl,
          finalUrl: probe.finalUrl,
          statusCode: probe.statusCode,
          compression: probe.compression,
          htmlBytes: probe.htmlBytes,
          cacheControl: probe.cacheControl,
          cacheStatus: probe.cacheStatus,
          age: probe.age,
          server: probe.server,
          poweredBy: probe.poweredBy,
          cdn: probe.cdn,
          http3Advertised: probe.http3Advertised,
          tlsVersion: probe.connection?.tlsVersion || null,
          alpn: probe.connection?.alpn || null,
          ip: probe.connection?.ip || null,
          headers: probe.headers,
        }
      : null,
    protocol: docReq?.protocol || probe?.connection?.alpn || null,
    timing,
    redirects,
    totalBytes,
    issues,
  };
}
