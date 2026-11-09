// Request list and byte breakdown, merged from Lighthouse network-requests and
// (when available) the Playwright response log.

import { audit, rows } from './lhr.js';

const TYPE_MAP = {
  Document: 'document',
  Stylesheet: 'css',
  Script: 'js',
  Image: 'image',
  Font: 'font',
  Media: 'media',
  XHR: 'xhr',
  Fetch: 'xhr',
  Other: 'other',
  Manifest: 'other',
  Ping: 'other',
  Preflight: 'other',
  TextTrack: 'other',
};

function typeFromMime(mime = '', url = '') {
  if (/html/.test(mime)) return 'document';
  if (/css/.test(mime)) return 'css';
  if (/javascript|ecmascript/.test(mime)) return 'js';
  if (/^image\//.test(mime)) return 'image';
  if (/font|woff/.test(mime)) return 'font';
  if (/^(video|audio)\//.test(mime)) return 'media';
  if (/json|xml/.test(mime)) return 'xhr';
  if (/\.(css)(\?|$)/i.test(url)) return 'css';
  if (/\.(m?js)(\?|$)/i.test(url)) return 'js';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return 'font';
  if (/\.(mp4|webm|mov|m3u8|mp3)(\?|$)/i.test(url)) return 'media';
  return 'other';
}

/** Build the entity lookup (origin → { name, category, isFirstParty }) from lhr.entities. */
export function entityLookup(lhr, finalUrl) {
  const map = new Map();
  for (const e of lhr?.entities || []) {
    for (const origin of e.origins || []) {
      map.set(origin, { name: e.name, category: e.category || null, isFirstParty: !!e.isFirstParty });
    }
  }
  let firstPartyHost = '';
  try {
    firstPartyHost = new URL(finalUrl).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  return (url) => {
    try {
      const u = new URL(url);
      const hit = map.get(u.origin);
      if (hit) return hit;
      const host = u.hostname.replace(/^www\./, '');
      const root = (h) => h.split('.').slice(-2).join('.');
      const first = host === firstPartyHost || root(host) === root(firstPartyHost);
      return { name: first ? 'First party' : u.hostname, category: null, isFirstParty: first };
    } catch {
      return { name: 'Unknown', category: null, isFirstParty: true };
    }
  };
}

export function extractRequests(lhr, inspection, finalUrl) {
  const lookup = entityLookup(lhr, finalUrl);
  let requests = [];
  const nr = rows(audit(lhr, 'network-requests'));
  if (nr.length) {
    const t0 = Math.min(...nr.map((r) => r.networkRequestTime ?? r.startTime ?? Infinity));
    requests = nr
      .filter((r) => r.url && !r.url.startsWith('data:'))
      .map((r) => {
        const start = (r.networkRequestTime ?? r.startTime ?? 0) - (Number.isFinite(t0) ? t0 : 0);
        const end = (r.networkEndTime ?? r.endTime ?? 0) - (Number.isFinite(t0) ? t0 : 0);
        const ent = lookup(r.url);
        return {
          url: r.url,
          type: TYPE_MAP[r.resourceType] || typeFromMime(r.mimeType, r.url),
          mimeType: r.mimeType || null,
          transferSize: r.transferSize ?? 0,
          resourceSize: r.resourceSize ?? 0,
          statusCode: r.statusCode ?? null,
          protocol: r.protocol || null,
          priority: r.priority || null,
          startMs: Math.max(0, Math.round(start)),
          endMs: Math.max(0, Math.round(end)),
          durationMs: Math.max(0, Math.round(end - start)),
          isLinkPreload: !!r.isLinkPreload,
          entity: (typeof r.entity === 'string' ? r.entity : r.entity?.text) || ent.name,
          thirdParty: !ent.isFirstParty,
        };
      });
  } else if (inspection?.responses?.length) {
    requests = inspection.responses.map((r) => {
      const ent = lookup(r.url);
      return {
        url: r.url,
        type: typeFromMime(r.contentType || '', r.url),
        mimeType: r.contentType || null,
        transferSize: r.bytes ?? 0,
        resourceSize: r.bytes ?? 0,
        statusCode: r.status ?? null,
        protocol: r.protocol || null,
        priority: null,
        startMs: Math.round(r.startMs ?? 0),
        endMs: Math.round(r.endMs ?? 0),
        durationMs: Math.round((r.endMs ?? 0) - (r.startMs ?? 0)),
        isLinkPreload: false,
        entity: ent.name,
        thirdParty: !ent.isFirstParty,
      };
    });
  }
  return { requests, lookup };
}

export function summarizeRequests(requests) {
  const byType = {};
  let bytes = 0;
  let thirdPartyBytes = 0;
  for (const r of requests) {
    const t = (byType[r.type] ||= { bytes: 0, count: 0 });
    t.bytes += r.transferSize || 0;
    t.count += 1;
    bytes += r.transferSize || 0;
    if (r.thirdParty) thirdPartyBytes += r.transferSize || 0;
  }
  return {
    requests: requests.length,
    bytes,
    thirdPartyBytes,
    byType,
    domains: new Set(requests.map((r) => { try { return new URL(r.url).host; } catch { return ''; } })).size,
  };
}
