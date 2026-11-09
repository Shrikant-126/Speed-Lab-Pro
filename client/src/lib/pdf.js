// Client-side PDF report generator (jsPDF + jspdf-autotable, lazy-loaded).

import { METRICS, rateMetric } from '@speedlab/shared/thresholds';
import { formatMetric, formatBytes, formatMs, shortUrl } from '@speedlab/shared/format';

const BRAND = [79, 70, 229];
const RATING_RGB = { good: [12, 206, 107], 'needs-improvement': [255, 164, 0], poor: [255, 78, 66], unavailable: [148, 163, 184] };
const RATING_TXT = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor', unavailable: 'Unavailable' };

function scoreRating(s) {
  if (s === null || s === undefined) return 'unavailable';
  return s >= 90 ? 'good' : s >= 50 ? 'needs-improvement' : 'poor';
}

function savingsText(s) {
  if (!s) return '—';
  const p = [];
  if (s.ms) p.push(formatMs(s.ms));
  if (s.bytes) p.push(formatBytes(s.bytes));
  if (!p.length) return '—';
  return `${p.join(' / ')} (${s.source === 'measured' ? 'measured' : s.source === 'lighthouse' ? 'Lighthouse est.' : 'estimate'})`;
}

export async function generatePdfReport({ report, compare = null }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;

  const ensure = (h) => {
    if (y + h > H - 50) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (text) => {
    ensure(40);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(text, M, y);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(1.5);
    doc.line(M, y + 5, M + 40, y + 5);
    y += 18;
  };
  const para = (text, size = 9.5, color = [71, 85, 105]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), W - 2 * M);
    ensure(lines.length * (size + 3));
    doc.text(lines, M, y);
    y += lines.length * (size + 3) + 4;
  };
  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[{ content: 'No data', colSpan: head.length }]],
      margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 14;
  };

  // ---- Cover header
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 96, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SpeedLab Pro', M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Website Performance Report', M, 62);
  doc.setFontSize(9);
  doc.text(shortUrl(report.finalUrl, 90), M, 80);
  y = 124;
  const src = report.sources || {};
  para(
    `URL: ${report.finalUrl}\nScan date: ${new Date(report.createdAt).toLocaleString()}\nDevice: ${report.strategy}\n` +
      `Data sources: Lighthouse ${src.lighthouse ? `${src.lighthouse === 'psi' ? 'via PageSpeed Insights' : 'local'} ${src.lighthouseVersion || ''}` : 'unavailable'}; ` +
      `field data ${src.field ? 'Chrome UX Report' : 'unavailable'}; browser inspection ${src.pageInspection ? 'Playwright' : 'unavailable'}; image measurements ${src.imageProbe ? 'Sharp' : 'unavailable'}.` +
      (report.platform?.label ? `\nPlatform: ${report.platform.label}${report.platform.theme ? ` (theme: ${report.platform.theme})` : ''}` : ''),
    9.5,
  );

  // ---- Scores
  heading('Lighthouse scores');
  const scores = [
    ['Performance', report.scores.performance],
    ['Accessibility', report.scores.accessibility],
    ['Best Practices', report.scores.bestPractices],
    ['SEO', report.scores.seo],
  ];
  ensure(80);
  const bw = (W - 2 * M - 30) / 4;
  scores.forEach(([label, s], i) => {
    const x = M + i * (bw + 10);
    doc.setFillColor(...RATING_RGB[scoreRating(s)]);
    doc.roundedRect(x, y, bw, 60, 6, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(s === null || s === undefined ? '—' : String(s), x + bw / 2, y + 32, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + bw / 2, y + 50, { align: 'center' });
  });
  y += 76;

  // ---- Core Web Vitals
  heading('Core Web Vitals (lab vs field)');
  const f = report.field;
  table(
    ['Metric', 'Lab value', 'Lab rating', 'Field p75', 'Field rating', 'Good threshold'],
    ['lcp', 'fcp', 'ttfb', 'cls', 'inp', 'tbt', 'si'].map((k) => {
      const lab = report.lab[k]?.value ?? null;
      const fv = f?.metrics?.[k]?.p75 ?? null;
      return [
        `${METRICS[k].short} – ${METRICS[k].label}`,
        k === 'inp' ? 'Not measurable in lab' : formatMetric(k, lab),
        k === 'inp' ? '—' : RATING_TXT[rateMetric(k, lab)],
        METRICS[k].labOnly ? 'Lab-only' : formatMetric(k, fv),
        METRICS[k].labOnly ? '—' : RATING_TXT[rateMetric(k, fv)],
        `≤ ${formatMetric(k, METRICS[k].good)}`,
      ];
    }),
  );
  para(f ? `Field data: real Chrome users, 75th percentile, ${f.scope}-level${f.collectionPeriod ? ` (${f.collectionPeriod.start} → ${f.collectionPeriod.end})` : ''}.` : 'Field data: unavailable (not enough Chrome UX Report traffic or no API key). No values were estimated.', 8.5);

  // ---- LCP breakdown
  heading('LCP breakdown');
  const lcp = report.lcp || {};
  if (lcp.element) para(`LCP element: ${lcp.element.selector || lcp.element.tag || 'unknown'}${lcp.imageUrl ? `\nLCP resource: ${lcp.imageUrl}` : ''}`, 9);
  if (lcp.phases?.length) {
    const total = lcp.phases.reduce((s, p) => s + p.ms, 0) || 1;
    const colors = [[14, 165, 233], [245, 158, 11], [139, 92, 246], [236, 72, 153]];
    ensure(40);
    let x = M;
    lcp.phases.forEach((p, i) => {
      const w = ((W - 2 * M) * p.ms) / total;
      doc.setFillColor(...colors[i % 4]);
      if (w > 0) doc.rect(x, y, w, 16, 'F');
      x += w;
    });
    y += 26;
    table(['Phase', 'Duration', 'Share'], lcp.phases.map((p) => [p.label, formatMs(p.ms), `${p.percent ?? Math.round((p.ms / total) * 100)}%`]), {
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = colors[d.row.index % 4];
      },
    });
    if (lcp.dominantPhase) para(`Largest phase: ${lcp.dominantPhase.label} (${formatMs(lcp.dominantPhase.ms)}). ${lcp.dominantPhase.explanation}`, 9);
    para(`Phase source: ${lcp.phaseSource === 'lighthouse' ? 'Lighthouse' : 'Playwright (unthrottled)'}`, 8);
  } else para('LCP phase data unavailable for this scan.');

  // ---- Issue tables per category
  const issuesBy = (cats) => report.issues.filter((i) => cats.includes(i.category));
  const issueRows = (list) => list.map((i) => [i.priority.toUpperCase(), i.title, shortUrl(i.resource || '—', 60), savingsText(i.savings)]);
  const sections = [
    ['Image issues', ['images']],
    ['Layout shift (CLS) issues', ['cls']],
    ['Video issues', ['video']],
    ['CSS & font issues', ['css', 'fonts']],
    ['JavaScript issues', ['javascript']],
    ['Server & network issues', ['server', 'network']],
    ['Third-party script issues', ['third-party']],
  ];
  for (const [title, cats] of sections) {
    const list = issuesBy(cats);
    if (!list.length) continue;
    heading(title);
    table(['Priority', 'Issue', 'Resource', 'Potential saving'], issueRows(list), { columnStyles: { 0: { cellWidth: 55 }, 3: { cellWidth: 95 } } });
  }

  if (report.thirdParty?.entities?.length) {
    heading('Third parties');
    table(
      ['Entity', 'Category', 'Transfer', 'Main thread', 'Recommendation'],
      report.thirdParty.entities.slice(0, 20).map((e) => [e.product || e.name, e.category, formatBytes(e.transferSize), e.mainThreadMs ? formatMs(e.mainThreadMs) : '—', e.recommendation]),
      { columnStyles: { 4: { cellWidth: 200 } } },
    );
  }

  // ---- Recommendations
  heading('Priority-based recommendations');
  table(
    ['#', 'Priority', 'Recommendation', 'Solution', 'Saving'],
    report.issues.map((i, n) => [n + 1, i.priority.toUpperCase(), i.title, i.solution, savingsText(i.savings)]),
    { columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 52 }, 3: { cellWidth: 200 }, 4: { cellWidth: 80 } } },
  );
  para('Savings marked "measured" were measured during this scan; "Lighthouse est." and "estimate" values are projections, not guarantees.', 8);

  // ---- Comparison
  if (compare?.comparison) {
    const c = compare.comparison;
    heading('Before / after comparison (measured)');
    para(`Baseline: ${compare.a.finalUrl} · ${compare.a.strategy} · ${new Date(compare.a.createdAt).toLocaleString()}\nCurrent: ${compare.b.finalUrl} · ${compare.b.strategy} · ${new Date(compare.b.createdAt).toLocaleString()}`, 9);
    table(['Score', 'Before', 'After', 'Change'], c.scores.map((s) => [s.key, s.before ?? '—', s.after ?? '—', s.delta === null ? '—' : `${s.delta > 0 ? '+' : ''}${s.delta}`]));
    table(
      ['Metric', 'Before', 'After', 'Change', 'Result'],
      c.metrics.map((m) => [m.key.toUpperCase(), formatMetric(m.key, m.before), formatMetric(m.key, m.after), m.percent === null ? '—' : `${m.percent > 0 ? '+' : ''}${m.percent.toFixed(1)}%`, m.improved === null ? '—' : m.improved ? 'Improved' : 'Worse/equal']),
    );
    table(['Resource', 'Before', 'After', 'Change'], c.weights.map((w) => [w.key, formatBytes(w.before), formatBytes(w.after), w.delta === null ? '—' : `${w.delta > 0 ? '+' : ''}${formatBytes(w.delta)}`]));
    para(`Resolved issue types: ${c.issues.resolved.join(', ') || 'none'}. New issue types: ${c.issues.introduced.join(', ') || 'none'}.`, 9);
  }

  // ---- Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`SpeedLab Pro · ${shortUrl(report.finalUrl, 60)}`, M, H - 20);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' });
  }
  return doc;
}
