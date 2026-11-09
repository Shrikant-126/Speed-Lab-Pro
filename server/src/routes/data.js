// Projects, report metadata, saved recommendations and code-snippet downloads.

import { Router } from 'express';
import { getStore } from '@speedlab/shared/store';
import { normalizeUrl, checkUrlStructure } from '@speedlab/shared/net';
import { generateFixes, snippetsToText } from '@speedlab/shared/codegen';
import { requireUser } from '../middleware/auth.js';

const router = Router();
const UUID = /^[0-9a-f-]{36}$/i;
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'in-progress', 'done', 'dismissed'];

// ---- Projects
router.get('/projects', requireUser, async (req, res, next) => {
  try {
    res.json(await getStore().listProjects({ userId: req.user.id }));
  } catch (e) {
    next(e);
  }
});
router.post('/projects', requireUser, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Project name is required' });
    const u = normalizeUrl(req.body?.url);
    checkUrlStructure(u);
    return res.status(201).json(await getStore().createProject({ userId: req.user.id, name, url: u.toString() }));
  } catch (e) {
    return next(e);
  }
});
router.delete('/projects/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = await getStore().deleteProject(req.params.id, { userId: req.user.id });
    return ok ? res.status(204).end() : res.status(404).json({ error: 'Project not found' });
  } catch (e) {
    return next(e);
  }
});

// ---- Reports (PDFs are rendered client-side; we record report history)
router.get('/reports', requireUser, async (req, res, next) => {
  try {
    res.json(await getStore().listReports({ userId: req.user.id }));
  } catch (e) {
    next(e);
  }
});
router.post('/reports', requireUser, async (req, res, next) => {
  try {
    const { scanId, compareScanId, title } = req.body || {};
    if (!UUID.test(scanId || '') || (compareScanId && !UUID.test(compareScanId))) return res.status(400).json({ error: 'Invalid scan id' });
    const store = getStore();
    if (!(await store.getScan(scanId, { userId: req.user.id }))) return res.status(404).json({ error: 'Scan not found' });
    return res.status(201).json(await store.saveReportMeta({ userId: req.user.id, scanId, compareScanId, title: String(title || 'Performance report').slice(0, 200) }));
  } catch (e) {
    return next(e);
  }
});
router.delete('/reports/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = await getStore().deleteReport(req.params.id, { userId: req.user.id });
    return ok ? res.status(204).end() : res.status(404).json({ error: 'Report not found' });
  } catch (e) {
    return next(e);
  }
});

// ---- Saved recommendations
function sanitizeIssue(issue) {
  if (!issue || typeof issue !== 'object' || typeof issue.type !== 'string' || typeof issue.title !== 'string') return null;
  if (!PRIORITIES.includes(issue.priority)) return null;
  const json = JSON.stringify(issue);
  if (json.length > 200_000) return null;
  return JSON.parse(json);
}
router.get('/recommendations', requireUser, async (req, res, next) => {
  try {
    res.json(await getStore().listRecommendations({ userId: req.user.id }));
  } catch (e) {
    next(e);
  }
});
router.post('/recommendations', requireUser, async (req, res, next) => {
  try {
    const issue = sanitizeIssue(req.body?.issue);
    if (!issue) return res.status(400).json({ error: 'Invalid issue' });
    const scanId = UUID.test(req.body?.scanId || '') ? req.body.scanId : null;
    return res.status(201).json(await getStore().saveRecommendation({ userId: req.user.id, scanId, issue }));
  } catch (e) {
    return next(e);
  }
});
router.patch('/recommendations/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id) || !STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid request' });
    const row = await getStore().updateRecommendation(req.params.id, { userId: req.user.id, status: req.body.status });
    return row ? res.json(row) : res.status(404).json({ error: 'Not found' });
  } catch (e) {
    return next(e);
  }
});
router.delete('/recommendations/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = await getStore().deleteRecommendation(req.params.id, { userId: req.user.id });
    return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
  } catch (e) {
    return next(e);
  }
});

// ---- Code snippets bundle download for a stored scan
router.get('/scans/:id/snippets', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const report = await getStore().getScan(req.params.id, { userId: req.user.id });
    if (!report) return res.status(404).json({ error: 'Scan not found' });
    const { contextFromReport } = await import('@speedlab/shared/codegen');
    const ctx = contextFromReport(report);
    const issues = req.query.issue ? report.issues.filter((i) => i.id === req.query.issue) : report.issues;
    const text = issues.map((i) => snippetsToText(i, generateFixes(i, ctx))).join('\n\n\n');
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="speedlab-snippets-${req.params.id.slice(0, 8)}.txt"`);
    return res.send(text);
  } catch (e) {
    return next(e);
  }
});

export default router;
