// JavaScript performance analysis: size, unused, bootup, long tasks, render-blocking,
// duplicates, legacy polyfills, event listeners and DOM mutations.

import { audit, rows, urlOf, sameResource, normUrl, subItems, savings } from './lhr.js';
import { makeIssue, priorityFromSavings } from './issue.js';

export function analyzeJs({ lhr, inspection, requests }) {
  const jsRequests = requests.filter((r) => r.type === 'js');
  const files = new Map();
  const get = (url) => {
    const key = normUrl(url);
    if (!files.has(key)) {
      const req = jsRequests.find((r) => sameResource(r.url, url));
      files.set(key, {
        url,
        transferSize: req?.transferSize ?? null,
        resourceSize: req?.resourceSize ?? null,
        thirdParty: req?.thirdParty ?? null,
        entity: req?.entity ?? null,
        startMs: req?.startMs ?? null,
        renderBlocking: false,
        blockingMs: null,
        unusedBytes: null,
        unusedPercent: null,
        bootupMs: null,
        scriptingMs: null,
        parseMs: null,
        loading: null,
      });
    }
    return files.get(key);
  };
  for (const r of jsRequests) get(r.url);

  const rb = audit(lhr, 'render-blocking-insight', 'render-blocking-resources');
  for (const it of rows(rb)) {
    const u = urlOf(it);
    if (!u || !jsRequests.some((r) => sameResource(r.url, u)) && !/\.m?js(\?|$)/i.test(u)) continue;
    const f = get(u);
    f.renderBlocking = true;
    f.blockingMs = it.wastedMs ?? null;
  }
  for (const it of rows(audit(lhr, 'unused-javascript'))) {
    const u = urlOf(it);
    if (!u) continue;
    const f = get(u);
    f.unusedBytes = it.wastedBytes ?? null;
    f.unusedPercent = it.wastedPercent ?? (it.totalBytes ? (it.wastedBytes / it.totalBytes) * 100 : null);
    f.transferSize ??= it.totalBytes;
  }
  for (const it of rows(audit(lhr, 'bootup-time'))) {
    const u = urlOf(it);
    if (!u || !/^https?:/.test(u)) continue;
    const f = get(u);
    f.bootupMs = it.total ?? null;
    f.scriptingMs = it.scripting ?? null;
    f.parseMs = it.scriptParseCompile ?? null;
  }
  for (const c of inspection?.coverage?.js || []) {
    if (!c.url || !/^https?:/.test(c.url)) continue;
    const f = get(c.url);
    if (c.totalBytes && f.unusedBytes === null) {
      f.unusedBytes = Math.max(0, c.totalBytes - c.usedBytes);
      f.unusedPercent = (f.unusedBytes / c.totalBytes) * 100;
    }
  }
  for (const s of inspection?.scripts || []) {
    if (!s.src) continue;
    const f = get(s.src);
    f.loading = s.module ? 'module' : s.async ? 'async' : s.defer ? 'defer' : s.inHead ? 'sync-head' : 'sync-body';
    if (!lhr && f.loading === 'sync-head') f.renderBlocking = true;
  }

  const list = [...files.values()].filter((f) => /^https?:/.test(f.url)).sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));
  const issues = [];

  // Render-blocking scripts
  const rbList = list.filter((f) => f.renderBlocking);
  if (rbList.length) {
    const ms = rbList.reduce((s, f) => s + (f.blockingMs || 0), 0) || savings(rb).ms;
    issues.push(makeIssue({
      type: 'js-render-blocking',
      category: 'javascript',
      title: `Render-blocking scripts (${rbList.length})`,
      description: 'Synchronous scripts in the <head> stop HTML parsing until they download and execute.',
      resource: rbList[0].url,
      why: 'A <script src> without async/defer/type="module" blocks the parser.',
      impact: 'Delays FCP and LCP.',
      metrics: ['FCP', 'LCP'],
      priority: priorityFromSavings({ ms }, { boost: 1 }),
      solution: 'Add defer to scripts that do not need to run before first paint (or async for independent scripts like analytics).',
      evidence: { files: rbList.map((f) => ({ url: f.url, transferSize: f.transferSize, blockingMs: f.blockingMs, thirdParty: f.thirdParty })) },
      savings: ms ? { ms, source: 'lighthouse' } : null,
    }));
  }
  // Unused JS
  const unused = list.filter((f) => (f.unusedBytes || 0) > 20_000);
  if (unused.length) {
    const bytes = unused.reduce((s, f) => s + f.unusedBytes, 0);
    const ua = audit(lhr, 'unused-javascript');
    issues.push(makeIssue({
      type: 'js-unused',
      category: 'javascript',
      title: `Unused JavaScript (${Math.round(bytes / 1024)} KB)`,
      description: `${unused.length} script${unused.length > 1 ? 's' : ''} ship code that was not executed during page load.`,
      resource: unused[0].url,
      why: 'Bundles include code for other pages/features, and third-party tags load full SDKs up front.',
      impact: 'More download, parse and compile time; higher TBT and INP.',
      metrics: ['LCP', 'TBT', 'INP'],
      priority: priorityFromSavings({ bytes: bytes * 1.5, ms: savings(ua).ms || 0 }),
      solution: 'Code-split by route/feature with dynamic import(), enable tree shaking, and delay non-critical third-party scripts until interaction.',
      evidence: { files: unused.map((f) => ({ url: f.url, unusedBytes: f.unusedBytes, unusedPercent: f.unusedPercent, thirdParty: f.thirdParty, entity: f.entity })) },
      savings: { bytes, source: inspection?.coverage ? 'measured' : 'lighthouse' },
    }));
  }
  // Heavy execution
  const heavy = list.filter((f) => (f.bootupMs || 0) > 150).sort((a, b) => b.bootupMs - a.bootupMs);
  if (heavy.length) {
    const ms = heavy.reduce((s, f) => s + f.bootupMs, 0);
    issues.push(makeIssue({
      type: 'js-execution',
      category: 'javascript',
      title: `Heavy JavaScript execution (${Math.round(ms)} ms)`,
      description: heavy.slice(0, 5).map((f) => `${f.url.split('/').pop().split('?')[0]}: ${Math.round(f.bootupMs)} ms`).join(', '),
      resource: heavy[0].url,
      why: 'Script evaluation runs on the main thread and blocks rendering and input handling.',
      impact: 'Increases TBT and INP; can delay LCP on client-rendered pages.',
      metrics: ['TBT', 'INP', 'LCP'],
      priority: priorityFromSavings({ ms: ms * 0.6 }),
      solution: 'Reduce or split the heaviest scripts, defer non-critical work with requestIdleCallback, and move heavy computation to Web Workers.',
      evidence: { files: heavy.slice(0, 15).map((f) => ({ url: f.url, bootupMs: f.bootupMs, scriptingMs: f.scriptingMs, parseMs: f.parseMs, thirdParty: f.thirdParty })) },
    }));
  }
  // Long tasks
  const longTasks = rows(audit(lhr, 'long-tasks')).map((t) => ({ url: urlOf(t), durationMs: t.duration, startMs: t.startTime }));
  const ltInspect = inspection?.longTasks || [];
  const allTasks = longTasks.length ? longTasks : ltInspect.map((t) => ({ url: t.attribution || null, durationMs: t.duration, startMs: t.start }));
  if (allTasks.filter((t) => t.durationMs > 50).length >= 3 || allTasks.some((t) => t.durationMs > 250)) {
    const tbt = audit(lhr, 'total-blocking-time')?.numericValue;
    issues.push(makeIssue({
      type: 'js-long-tasks',
      category: 'javascript',
      title: `Long main-thread tasks (${allTasks.length})`,
      description: `Longest task: ${Math.round(Math.max(...allTasks.map((t) => t.durationMs)))} ms.${tbt ? ` Total Blocking Time: ${Math.round(tbt)} ms.` : ''}`,
      resource: allTasks.sort((a, b) => b.durationMs - a.durationMs)[0].url,
      why: 'Tasks longer than 50 ms block input handling and rendering.',
      impact: 'Increases TBT and INP.',
      metrics: ['TBT', 'INP'],
      priority: tbt > 600 ? 'high' : 'medium',
      solution: 'Break up long tasks by yielding to the main thread (scheduler.yield() / setTimeout), and defer non-critical initialisation.',
      evidence: { tasks: allTasks.slice(0, 20) },
    }));
  }
  // Duplicates
  const dupA = audit(lhr, 'duplicated-javascript-insight', 'duplicated-javascript');
  const dupRows = rows(dupA).filter((r) => (r.wastedBytes || 0) > 5_000);
  const globalDupes = [];
  const g = inspection?.globals || {};
  if (Array.isArray(g.jqueryVersions) && new Set(g.jqueryVersions).size > 1) globalDupes.push(`jQuery ${[...new Set(g.jqueryVersions)].join(' + ')}`);
  const libNames = new Map();
  for (const f of list) {
    const m = f.url.split('?')[0].split('/').pop().match(/^(jquery|lodash|underscore|moment|swiper|slick|bootstrap|gsap|react|vue|alpine|axios)[.-]?([\d.]+)?/i);
    if (m) {
      const k = m[1].toLowerCase();
      libNames.set(k, [...(libNames.get(k) || []), f.url]);
    }
  }
  for (const [k, urls] of libNames) if (urls.length > 1) globalDupes.push(`${k} loaded ${urls.length}×`);
  if (dupRows.length || globalDupes.length) {
    const bytes = dupRows.reduce((s, r) => s + (r.wastedBytes || 0), 0);
    issues.push(makeIssue({
      type: 'js-duplicates',
      category: 'javascript',
      title: 'Duplicate JavaScript libraries or modules',
      description: [...dupRows.map((r) => `${r.source || urlOf(r)} (${Math.round((r.wastedBytes || 0) / 1024)} KB)`), ...globalDupes].slice(0, 8).join('; '),
      resource: dupRows[0]?.source || null,
      why: 'Multiple bundles, themes or plugins each include their own copy of the same library.',
      impact: 'Wasted download and execution time.',
      metrics: ['TBT', 'INP'],
      priority: bytes > 100_000 ? 'high' : 'medium',
      solution: 'Load shared libraries once (dedupe in your bundler, or dequeue the plugin copy), and remove unused versions.',
      evidence: { modules: dupRows.map((r) => ({ source: r.source || urlOf(r), wastedBytes: r.wastedBytes, files: subItems(r).map((s) => urlOf(s)) })), detected: globalDupes },
      savings: bytes ? { bytes, source: 'lighthouse' } : null,
    }));
  }
  // Legacy JS
  const legacy = rows(audit(lhr, 'legacy-javascript-insight', 'legacy-javascript')).filter((r) => (r.wastedBytes || 0) > 5_000);
  if (legacy.length) {
    const bytes = legacy.reduce((s, r) => s + (r.wastedBytes || 0), 0);
    issues.push(makeIssue({
      type: 'js-legacy',
      category: 'javascript',
      title: 'Legacy JavaScript polyfills shipped to modern browsers',
      description: `${legacy.length} script(s) include polyfills/transforms not needed by modern browsers.`,
      resource: urlOf(legacy[0]),
      why: 'Transpiling to ES5 and bundling core-js for all browsers adds bytes and execution time.',
      impact: 'Wasted download and parse time.',
      metrics: ['TBT'],
      priority: priorityFromSavings({ bytes }),
      solution: 'Target modern browsers in Babel/SWC/esbuild (browserslist "defaults and fully supports es6-module") and drop unnecessary polyfills.',
      evidence: { files: legacy.map((r) => ({ url: urlOf(r), wastedBytes: r.wastedBytes })) },
      savings: { bytes, source: 'lighthouse' },
    }));
  }
  // Event listeners (instrumented via init script)
  const L = inspection?.listeners;
  if (L && (L.total > 1500 || (L.nonPassive || 0) > 20)) {
    issues.push(makeIssue({
      type: 'js-listeners',
      category: 'javascript',
      title: `High number of event listeners (${L.total.toLocaleString()})`,
      description: `${L.scrollLike || 0} scroll/touch/wheel listeners, ${L.nonPassive || 0} of them not passive. Top types: ${Object.entries(L.byType || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
      resource: null,
      why: 'Per-element listeners (instead of event delegation) increase memory and setup time; non-passive scroll/touch listeners can delay scrolling.',
      impact: 'Increases TBT and INP.',
      metrics: ['INP', 'TBT'],
      priority: 'medium',
      solution: 'Use event delegation on a common parent and mark scroll/touch/wheel listeners as { passive: true }.',
      evidence: { listeners: L },
    }));
  }
  const M = inspection?.mutations;
  if (M && M.count > 3000) {
    issues.push(makeIssue({
      type: 'js-dom-mutation',
      category: 'javascript',
      title: `Excessive DOM manipulation during load (${M.count.toLocaleString()} mutations)`,
      description: `DOM size: ${inspection?.domNodes?.toLocaleString() || 'n/a'} nodes. Layouts: ${inspection?.cdpMetrics?.LayoutCount ?? 'n/a'}, style recalcs: ${inspection?.cdpMetrics?.RecalcStyleCount ?? 'n/a'}.`,
      resource: null,
      why: 'Scripts that build or rearrange large parts of the DOM after load force repeated style and layout work.',
      impact: 'Increases TBT and INP; can cause layout shifts.',
      metrics: ['TBT', 'INP', 'CLS'],
      priority: 'medium',
      solution: 'Render markup on the server, batch DOM writes (DocumentFragment / single innerHTML), and avoid reading layout between writes.',
      evidence: { mutations: M, domNodes: inspection?.domNodes, cdp: inspection?.cdpMetrics },
    }));
  }
  const domSize = audit(lhr, 'dom-size-insight', 'dom-size');
  const domNodes = domSize?.numericValue ?? inspection?.domNodes ?? null;
  if (domNodes && domNodes > 1500) {
    issues.push(makeIssue({
      type: 'dom-size',
      category: 'javascript',
      title: `Large DOM (${Math.round(domNodes).toLocaleString()} elements)`,
      description: 'Large DOMs increase memory usage, style calculation and layout cost.',
      resource: null,
      why: 'Mega-menus, hidden mobile/desktop duplicates, and long product grids rendered all at once.',
      impact: 'Higher INP and TBT, slower style recalculation.',
      metrics: ['INP', 'TBT'],
      priority: domNodes > 3000 ? 'medium' : 'low',
      solution: 'Avoid duplicating markup for mobile/desktop, paginate/virtualise long lists, and use content-visibility: auto for offscreen sections.',
      evidence: { domNodes },
    }));
  }

  const mainThread = rows(audit(lhr, 'mainthread-work-breakdown')).map((r) => ({ group: r.groupLabel || r.group, ms: Math.round(r.duration || 0) }));
  return {
    files: list,
    totals: {
      count: list.length,
      bytes: list.reduce((s, f) => s + (f.transferSize || 0), 0),
      unusedBytes: list.reduce((s, f) => s + (f.unusedBytes || 0), 0),
      thirdPartyBytes: list.filter((f) => f.thirdParty).reduce((s, f) => s + (f.transferSize || 0), 0),
      bootupMs: Math.round(audit(lhr, 'bootup-time')?.numericValue ?? list.reduce((s, f) => s + (f.bootupMs || 0), 0)),
      mainThreadMs: Math.round(audit(lhr, 'mainthread-work-breakdown')?.numericValue ?? 0) || null,
      domNodes,
    },
    mainThread,
    longTasks: allTasks.slice(0, 30),
    listeners: inspection?.listeners || null,
    mutations: inspection?.mutations || null,
    cdpMetrics: inspection?.cdpMetrics || null,
    issues,
  };
}
