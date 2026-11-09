// Layout shift culprits (from Lighthouse layout-shift audits and the Playwright CLS observer).

import { audit, rows, nodes, subItems } from './lhr.js';
import { makeIssue } from './issue.js';

export function analyzeCls({ lhr, inspection, clsValue }) {
  const shifts = [];
  const a = audit(lhr, 'cls-culprits-insight', 'layout-shifts', 'layout-shift-elements');
  for (const r of rows(a)) {
    const node = r.node || nodes({ details: r })[0];
    if (!node) continue;
    shifts.push({
      selector: node.selector || null,
      snippet: node.snippet || null,
      label: node.nodeLabel || null,
      score: r.score ?? r.value ?? null,
      causes: subItems(r).map((s) => s.extra?.value || s.cause || s.description).filter(Boolean),
    });
  }
  if (!shifts.length) {
    for (const s of inspection?.cls?.sources || []) {
      shifts.push({ selector: s.selector, snippet: s.snippet || null, label: s.tag, score: s.value, causes: [] });
    }
  }
  const issues = [];
  if ((clsValue ?? 0) > 0.1 && shifts.length) {
    issues.push(makeIssue({
      type: 'cls-shifts',
      category: 'cls',
      title: `Layout shifts detected (CLS ${clsValue.toFixed(3)})`,
      description: shifts.slice(0, 5).map((s) => `${s.label || s.selector}${s.score ? ` (${Number(s.score).toFixed(3)})` : ''}${s.causes.length ? ` – ${s.causes.join(', ')}` : ''}`).join('\n'),
      resource: shifts[0].selector,
      why: 'Content moved after it was first rendered: images/embeds without reserved space, late-loading banners, or web-font swaps.',
      impact: 'Directly increases CLS.',
      metrics: ['CLS'],
      priority: clsValue > 0.25 ? 'critical' : 'high',
      solution: 'Reserve space with width/height or aspect-ratio, use min-height for dynamic slots (announcement bars, reviews, ads), and use size-adjusted fallback fonts.',
      evidence: { shifts: shifts.slice(0, 10) },
    }));
  }
  return { shifts, issues };
}
