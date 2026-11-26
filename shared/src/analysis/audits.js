// Compact copy of Lighthouse's performance audits (Insights + Diagnostics), so the client can show
// them like PageSpeed Insights: title, "Est savings", metric tags, and the expandable table/tree.
// Only what is needed for display is kept (items capped, snippets trimmed) to keep reports small.

const MAX_ITEMS = 30;
const MAX_SUB = 10;
const MAX_DEPTH = 7;

const trim = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);

function rect(r) {
  if (!r || !(r.width > 0) || !(r.height > 0)) return null;
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

/** Compact a single table cell value. */
function value(v, depth) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return typeof v === 'string' ? trim(v, 600) : v;
  if (Array.isArray(v)) return v.slice(0, MAX_SUB).map((x) => value(x, depth + 1));
  switch (v.type) {
    case 'node':
      return { type: 'node', selector: trim(v.selector, 200) || null, snippet: trim(v.snippet, 400) || null, nodeLabel: trim(v.nodeLabel, 160) || null, rect: rect(v.boundingRect), lhId: v.lhId || null };
    case 'source-location':
      return { type: 'source-location', url: v.url || null, line: v.line ?? null, column: v.column ?? null };
    case 'url':
      return { type: 'url', value: v.value };
    case 'code':
      return { type: 'code', value: trim(String(v.value ?? ''), 400) };
    case 'link':
      return { type: 'link', text: v.text, url: v.url };
    case 'text':
      return { type: 'text', value: trim(String(v.value ?? ''), 600) };
    case 'numeric':
      return { type: 'numeric', value: v.value, granularity: v.granularity ?? null };
    case 'thumbnail':
      return { type: 'thumbnail', url: v.url || null };
    case 'subitems':
      return { type: 'subitems', items: (v.items || []).slice(0, MAX_SUB).map((it) => item(it, depth + 1)) };
    default:
      if (depth > MAX_DEPTH) return null;
      // entity objects, etc.
      if (typeof v.text === 'string') return v.text;
      return details(v, depth + 1);
  }
}

function item(it, depth) {
  if (!it || typeof it !== 'object') return it;
  const out = {};
  for (const [k, v] of Object.entries(it)) {
    if (k === 'debugData') continue;
    out[k] = k === 'entity' && v && typeof v === 'object' ? v.text || v.name || null : value(v, depth);
  }
  return out;
}

function chains(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > 12) return null;
  const out = {};
  let n = 0;
  for (const [id, c] of Object.entries(obj)) {
    if (n++ >= 20) break;
    out[id] = {
      url: c.url || c.request?.url || null,
      navStartToEndTime: c.navStartToEndTime ?? (c.request ? Math.round((c.request.endTime - c.request.startTime) * 1000) : null),
      transferSize: c.transferSize ?? c.request?.transferSize ?? null,
      isLongest: !!c.isLongest,
      children: chains(c.children, depth + 1),
    };
  }
  return out;
}

/** Compact an audit's details block (table, opportunity, list, network tree, checklist…). */
function details(d, depth = 0) {
  if (!d || typeof d !== 'object' || depth > MAX_DEPTH) return null;
  switch (d.type) {
    case 'table':
    case 'opportunity':
      return {
        type: 'table',
        headings: (d.headings || []).filter((h) => h && h.key !== undefined).map((h) => ({
          key: h.key,
          label: h.label || h.text || '',
          valueType: h.valueType || h.itemType || 'text',
          granularity: h.granularity ?? null,
          sub: h.subItemsHeading ? { key: h.subItemsHeading.key, valueType: h.subItemsHeading.valueType || h.valueType || 'text' } : null,
        })),
        items: (d.items || []).slice(0, MAX_ITEMS).map((it) => item(it, depth + 1)),
        more: Math.max(0, (d.items || []).length - MAX_ITEMS),
        isEntityGrouped: !!d.isEntityGrouped,
      };
    case 'list':
      return { type: 'list', items: (d.items || []).slice(0, 10).map((x) => details(x, depth + 1)).filter(Boolean) };
    case 'list-section':
      return { type: 'list-section', title: d.title || null, description: d.description || null, value: details(d.value, depth + 1) };
    case 'network-tree':
    case 'criticalrequestchain':
      return { type: 'network-tree', chains: chains(d.chains, 0), longestChain: d.longestChain ? { duration: d.longestChain.duration ?? null } : null };
    case 'checklist':
      return { type: 'checklist', items: Object.fromEntries(Object.entries(d.items || {}).map(([k, v]) => [k, { label: v.label, value: !!v.value }])) };
    case 'text':
      return { type: 'text', value: trim(String(d.value ?? ''), 1000) };
    case 'node':
      return value(d, depth);
    default:
      return null; // screenshots, filmstrips, debugdata, treemap-data
  }
}

function rating(a) {
  if (['notApplicable'].includes(a.scoreDisplayMode)) return 'pass';
  if (['informative', 'manual'].includes(a.scoreDisplayMode) || a.score === null || a.score === undefined) return 'info';
  if (a.score >= 0.9) return 'pass';
  if (a.score >= 0.5) return 'average';
  return 'fail';
}

/**
 * @returns {{ groups: { key, title, audits: object[] }[], passed: { id, title }[], stackPack: string|null }}
 */
export function extractAudits(lhr) {
  const refs = lhr?.categories?.performance?.auditRefs;
  if (!refs || !lhr?.audits) return null;
  const pack = (lhr.stackPacks || [])[0] || null;
  const groupOf = (g) => (g === 'insights' ? 'insights' : g === 'diagnostics' || g === 'load-opportunities' ? 'diagnostics' : null);
  const out = { insights: [], diagnostics: [] };
  const passed = [];
  for (const ref of refs) {
    const key = groupOf(ref.group);
    if (!key) continue;
    const a = lhr.audits[ref.id];
    if (!a || a.scoreDisplayMode === 'error') continue;
    const r = rating(a);
    const metricSavings = Object.fromEntries(Object.entries(a.metricSavings || {}).filter(([, v]) => typeof v === 'number' && v > 0));
    const hasDetails = a.details && (a.details.items?.length || a.details.chains || a.details.type === 'checklist' || a.details.type === 'list');
    if (r === 'pass' || (r === 'info' && !hasDetails && !a.displayValue)) {
      passed.push({ id: a.id, title: a.title, group: key });
      continue;
    }
    out[key].push({
      id: a.id,
      title: a.title,
      description: a.description || '',
      displayValue: a.displayValue || null,
      rating: r,
      score: a.score ?? null,
      metricSavings,
      savingsBytes: a.details?.overallSavingsBytes ?? null,
      savingsMs: a.details?.overallSavingsMs ?? null,
      details: details(a.details),
      stackPackHint: pack?.descriptions?.[a.id] || null,
    });
  }
  const order = { fail: 0, average: 1, info: 2 };
  // Like PageSpeed: failing first, then by estimated savings.
  const weight = (x) => (x.metricSavings.LCP || 0) + (x.metricSavings.FCP || 0) + (x.metricSavings.TBT || 0) + (x.metricSavings.CLS || 0) * 1000;
  for (const k of Object.keys(out)) out[k].sort((a, b) => order[a.rating] - order[b.rating] || weight(b) - weight(a));
  return {
    groups: [
      { key: 'insights', title: 'Insights', audits: out.insights },
      { key: 'diagnostics', title: 'Diagnostics', audits: out.diagnostics },
    ].filter((g) => g.audits.length),
    passed,
    stackPack: pack ? pack.title || pack.id : null,
  };
}
