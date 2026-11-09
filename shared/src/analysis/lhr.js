// Helpers for reading a Lighthouse result (LHR) robustly across Lighthouse versions.
// Lighthouse 12/13 moved many diagnostics into "*-insight" audits; we read the
// insight audit first and fall back to the legacy audit id.

export function audit(lhr, ...ids) {
  if (!lhr?.audits) return null;
  for (const id of ids) {
    const a = lhr.audits[id];
    if (a && a.scoreDisplayMode !== 'error') return a;
  }
  return null;
}

export function numeric(lhr, ...ids) {
  const a = audit(lhr, ...ids);
  return typeof a?.numericValue === 'number' ? a.numericValue : null;
}

/** Recursively collect table/opportunity rows from an audit's details. */
export function rows(a) {
  const out = [];
  const visit = (d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) return d.forEach(visit);
    if ((d.type === 'table' || d.type === 'opportunity') && Array.isArray(d.items)) {
      out.push(...d.items);
      return;
    }
    if (d.type === 'list' && Array.isArray(d.items)) return d.items.forEach(visit);
    if (d.items && Array.isArray(d.items) && !d.type) out.push(...d.items);
  };
  visit(a?.details);
  return out;
}

/** Find every "node" value inside an audit's details. */
export function nodes(a) {
  const out = [];
  const visit = (d, depth = 0) => {
    if (!d || typeof d !== 'object' || depth > 8) return;
    if (d.type === 'node' && (d.snippet || d.selector || d.nodeLabel)) {
      out.push(d);
      return;
    }
    for (const v of Object.values(d)) visit(v, depth + 1);
  };
  visit(a?.details);
  return out;
}

/** Find checklist items: { key: { label, value } } inside insight audits. */
export function checklist(a) {
  const out = {};
  const visit = (d, depth = 0) => {
    if (!d || typeof d !== 'object' || depth > 6) return;
    if (d.type === 'checklist' && d.items && typeof d.items === 'object') {
      Object.assign(out, d.items);
      return;
    }
    for (const v of Object.values(d)) visit(v, depth + 1);
  };
  visit(a?.details);
  return out;
}

export function urlOf(item) {
  if (!item) return null;
  if (typeof item.url === 'string') return item.url;
  if (item.url?.value) return item.url.value;
  if (typeof item.source === 'string') return item.source;
  if (item.source?.url) return item.source.url;
  if (item.source?.value) return item.source.value;
  return null;
}

export function entityName(item) {
  const e = item?.entity;
  if (!e) return null;
  if (typeof e === 'string') return e;
  return e.text || e.name || null;
}

export function subItems(item) {
  return Array.isArray(item?.subItems?.items) ? item.subItems.items : [];
}

/** Audit savings in ms/bytes (Lighthouse 10+ "metricSavings" or legacy overallSavings*). */
export function savings(a) {
  if (!a) return { ms: null, bytes: null };
  const ms = a.metricSavings?.LCP ?? a.metricSavings?.FCP ?? a.details?.overallSavingsMs ?? null;
  const bytes = a.details?.overallSavingsBytes ?? null;
  return { ms: typeof ms === 'number' ? ms : null, bytes: typeof bytes === 'number' ? bytes : null };
}

export function failed(a) {
  if (!a) return false;
  if (a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual') return false;
  if (a.scoreDisplayMode === 'informative') return rows(a).length > 0;
  return typeof a.score === 'number' && a.score < 0.9;
}

/** Normalise a URL for matching (strip hash, decode, lowercase host). */
export function normUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(u);
    x.hash = '';
    return x.toString();
  } catch {
    return String(u);
  }
}

export function sameResource(a, b) {
  if (!a || !b) return false;
  const na = normUrl(a);
  const nb = normUrl(b);
  if (na === nb) return true;
  try {
    const ua = new URL(na);
    const ub = new URL(nb);
    return ua.host === ub.host && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}

/** Extract an attribute value from an HTML snippet. */
export function attrFromSnippet(snippet, name) {
  if (!snippet) return null;
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = snippet.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}

export function hasAttr(snippet, name) {
  if (!snippet) return false;
  return new RegExp(`\\s${name}(\\s|=|>|/)`, 'i').test(snippet);
}
