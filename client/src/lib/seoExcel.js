// SEO issues Excel (.xlsx) export / import, using ExcelJS (lazy-loaded).
// Export: Summary, SEO checks (with team tracking columns + dropdown), Structured data,
//         All issues. Import: reads the "SEO checks" sheet back (ID, Progress, Owner,
//         Due date, Notes) so teams can track fixes and compare with the latest scan.

export const PROGRESS = ['Open', 'In progress', 'Done', "Won't fix"];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const STATUS_FILL = { pass: 'FFD1FAE5', warn: 'FFFEF3C7', fail: 'FFFEE2E2', info: 'FFE0F2FE', manual: 'FFF1F5F9' };

const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return 'site';
  }
};
const trackingKey = (url) => `speedlab-seo-tracking:${host(url)}`;

export function loadTracking(url) {
  try {
    return JSON.parse(localStorage.getItem(trackingKey(url)) || '{}');
  } catch {
    return {};
  }
}
export function saveTracking(url, map) {
  try {
    localStorage.setItem(trackingKey(url), JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

const text = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
  }
  return String(v).slice(0, 5000);
};

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 22;
}

export async function exportSeoExcel(report) {
  const { default: ExcelJS } = await import('exceljs');
  const seo = report.seo;
  const tracking = loadTracking(report.finalUrl);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SpeedLab Pro';
  wb.created = new Date();
  const checks = [...seo.checks, ...seo.tagChecks];

  // ---- Summary
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 32 }, { width: 80 }];
  [
    ['SpeedLab Pro – SEO & Analytics report'],
    [],
    ['URL', report.finalUrl],
    ['Scan date', new Date(report.createdAt).toLocaleString()],
    ['Device', report.strategy],
    ['SpeedLab SEO score', seo.score ?? 'n/a'],
    ['Lighthouse SEO score', seo.lighthouseScore ?? 'n/a'],
    ['Passed', checks.filter((c) => c.status === 'pass').length],
    ['Warnings', checks.filter((c) => c.status === 'warn').length],
    ['Failed', checks.filter((c) => c.status === 'fail').length],
    ['Title', seo.meta.title || ''],
    ['Meta description', seo.meta.description || ''],
    ['Canonical', seo.meta.canonical || ''],
    ['GTM containers', seo.analytics.gtm.join(', ')],
    ['GA4 IDs', seo.analytics.ga4.join(', ')],
    ['Consent Mode defaults', seo.analytics.consentDefault ? 'Yes' : 'No'],
    [],
    ['How to use', 'Fill Owner / Due date / Progress / Notes in the "SEO checks" sheet, save, then Import it back in SpeedLab Pro → SEO & Analytics.'],
  ].forEach((r) => sum.addRow(r));
  sum.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF4F46E5' } };
  sum.getColumn(1).font = { bold: true };
  sum.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  // ---- SEO checks
  const ws = wb.addWorksheet('SEO checks', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID', key: 'id', width: 20 },
    { header: 'Group', key: 'group', width: 16 },
    { header: 'Check', key: 'title', width: 34 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Details', key: 'detail', width: 60 },
    { header: 'How to fix', key: 'fix', width: 55 },
    { header: 'Recommended code', key: 'code', width: 55 },
    { header: 'Owner', key: 'owner', width: 16 },
    { header: 'Due date', key: 'due', width: 13 },
    { header: 'Progress', key: 'progress', width: 13 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  styleHeader(ws.getRow(1));
  const order = { fail: 0, warn: 1, info: 2, manual: 3, pass: 4 };
  for (const c of [...checks].sort((a, b) => order[a.status] - order[b.status])) {
    const t = tracking[c.id] || {};
    const row = ws.addRow({
      id: c.id,
      group: c.group,
      title: c.title,
      status: c.status.toUpperCase(),
      severity: c.severity,
      detail: c.detail,
      fix: c.fix || '',
      code: c.code || '',
      owner: t.owner || '',
      due: t.due || '',
      progress: t.progress || (c.status === 'pass' ? 'Done' : 'Open'),
      notes: t.notes || '',
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[c.status] || 'FFFFFFFF' } };
    row.getCell('code').font = { name: 'Consolas', size: 9 };
    row.getCell('progress').dataValidation = { type: 'list', allowBlank: true, formulae: [`"${PROGRESS.join(',')}"`] };
  }
  ws.autoFilter = { from: 'A1', to: 'L1' };

  // ---- Structured data
  const sd = wb.addWorksheet('Structured data');
  sd.columns = [{ header: 'Block', width: 8 }, { header: 'Valid JSON', width: 11 }, { header: 'Types', width: 30 }, { header: 'Errors', width: 60 }, { header: 'Warnings', width: 60 }];
  styleHeader(sd.getRow(1));
  seo.structuredData.blocks.forEach((b, i) => {
    sd.addRow([i + 1, b.valid ? 'Yes' : 'No', b.nodes.flatMap((n) => n.types).join(', '), [b.error, ...b.nodes.flatMap((n) => n.errors)].filter(Boolean).join('\n'), b.nodes.flatMap((n) => n.warnings).join('\n')]).alignment = { wrapText: true, vertical: 'top' };
  });

  // ---- All issues (performance + SEO)
  const all = wb.addWorksheet('All issues', { views: [{ state: 'frozen', ySplit: 1 }] });
  all.columns = [{ header: 'Priority', width: 10 }, { header: 'Category', width: 14 }, { header: 'Issue', width: 50 }, { header: 'Resource', width: 50 }, { header: 'Solution', width: 70 }];
  styleHeader(all.getRow(1));
  for (const i of report.issues || []) all.addRow([i.priority, i.category, i.title, i.resource || '', i.solution]).alignment = { wrapText: true, vertical: 'top' };

  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `speedlab-seo-${host(report.finalUrl)}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

/** Read an exported (and edited) workbook. Returns { rows, url? }. */
export async function importSeoExcel(file) {
  if (!file) throw new Error('Choose an .xlsx file');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('File is larger than 10 MB');
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Only .xlsx files exported from SpeedLab Pro are supported');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('The file could not be read as an Excel workbook');
  }
  const ws = wb.getWorksheet('SEO checks') || wb.worksheets.find((w) => /seo/i.test(w.name)) || wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found');
  const header = (ws.getRow(1).values || []).map((v) => text(v).trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idCol = col('id');
  if (idCol < 1) throw new Error('The "SEO checks" sheet needs an ID column (export from SpeedLab Pro first)');
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1 || rows.length >= 2000) return;
    const get = (name) => (col(name) > 0 ? text(row.getCell(col(name)).value).trim() : '');
    const id = get('id');
    if (!id || !/^[\w-]{1,60}$/.test(id)) return;
    const progress = PROGRESS.find((p) => p.toLowerCase() === get('progress').toLowerCase()) || 'Open';
    rows.push({ id, title: get('check'), status: get('status').toLowerCase(), owner: get('owner').slice(0, 80), due: get('due date').slice(0, 20), progress, notes: get('notes').slice(0, 1000) });
  });
  const summary = wb.getWorksheet('Summary');
  let url = null;
  summary?.eachRow((row) => {
    if (text(row.getCell(1).value).trim() === 'URL') url = text(row.getCell(2).value).trim();
  });
  return { rows, url };
}
