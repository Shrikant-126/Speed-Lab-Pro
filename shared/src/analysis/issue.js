// Issue factory and priority helpers used by every analysis module.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * @param {object} p
 * @param {string} p.type        codegen key (e.g. 'lcp-fetchpriority')
 * @param {string} p.category    lcp | images | video | css | javascript | fonts | network | server | third-party | cls
 * @param {string} p.title
 * @param {string} p.description
 * @param {string} [p.resource]  affected URL or selector
 * @param {string} p.why         root cause explanation
 * @param {string} p.impact      which metrics are affected and how
 * @param {'critical'|'high'|'medium'|'low'} p.priority
 * @param {string} p.solution
 * @param {object} [p.evidence]  raw data used for code generation
 * @param {{ms?:number,bytes?:number,source:'lighthouse'|'measured'|'estimate'}} [p.savings]
 */
export function makeIssue(p) {
  return {
    id: `${p.type}-${hash(`${p.type}|${p.resource || ''}|${p.title}`)}`,
    type: p.type,
    category: p.category,
    title: p.title,
    description: p.description,
    resource: p.resource || null,
    why: p.why,
    impact: p.impact,
    metrics: p.metrics || [],
    priority: p.priority,
    solution: p.solution,
    evidence: p.evidence || {},
    savings: p.savings || null,
  };
}

/** Priority from estimated savings. */
export function priorityFromSavings({ ms = 0, bytes = 0 } = {}, { boost = 0 } = {}) {
  let level = 0;
  if (ms >= 1500 || bytes >= 1_000_000) level = 3;
  else if (ms >= 600 || bytes >= 300_000) level = 2;
  else if (ms >= 150 || bytes >= 50_000) level = 1;
  level = Math.min(3, level + boost);
  return ['low', 'medium', 'high', 'critical'][level];
}
