// Scan jobs + scan history + comparison.

import { Router } from 'express';
import { normalizeUrl, checkUrlStructure, validatePublicUrl } from '@speedlab/shared/net';
import { compareReports } from '@speedlab/shared/analysis';
import { getStore } from '@speedlab/shared/store';
import { createJob, getJob, cancelJob } from '../workerClient.js';
import { scanLimiter } from '../middleware/limits.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
const UUID = /^[0-9a-f-]{36}$/i;

function publicJob(job) {
  const { owner, ...rest } = job;
  return rest;
}

// Start one or two scans (mobile/desktop/both)
router.post('/jobs', requireUser, scanLimiter, async (req, res, next) => {
  try {
    const { url, strategy = 'mobile', projectId = null } = req.body || {};
    const strategies = strategy === 'both' ? ['mobile', 'desktop'] : [strategy];
    if (!strategies.every((s) => ['mobile', 'desktop'].includes(s))) {
      return res.status(400).json({ error: 'strategy must be mobile, desktop or both' });
    }
    const normalized = normalizeUrl(url);
    checkUrlStructure(normalized);
    const safe = await validatePublicUrl(normalized); // DNS check up-front for a fast error
    if (projectId && !UUID.test(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
    const jobs = [];
    for (const s of strategies) {
      jobs.push(publicJob(await createJob({ url: safe, strategy: s, userId: req.user.id, projectId })));
    }
    return res.status(202).json({ jobs });
  } catch (err) {
    return next(err);
  }
});

router.get('/jobs/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid job id' });
    const job = await getJob(req.params.id);
    if (!job || (job.owner && job.owner !== req.user.id)) return res.status(404).json({ error: 'Job not found or expired' });
    return res.json(publicJob(job));
  } catch (err) {
    return next(err);
  }
});

router.delete('/jobs/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid job id' });
    const job = await getJob(req.params.id);
    if (!job || (job.owner && job.owner !== req.user.id)) return res.status(404).json({ error: 'Job not found' });
    return res.json(publicJob(await cancelJob(req.params.id)));
  } catch (err) {
    return next(err);
  }
});

// History
router.get('/scans', requireUser, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await getStore().listScans({
      userId: req.user.id,
      url: typeof req.query.url === 'string' ? req.query.url.slice(0, 200) : undefined,
      strategy: ['mobile', 'desktop'].includes(req.query.strategy) ? req.query.strategy : undefined,
      projectId: UUID.test(req.query.projectId || '') ? req.query.projectId : undefined,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/scans/compare', requireUser, async (req, res, next) => {
  try {
    const { a, b } = req.query;
    if (!UUID.test(a || '') || !UUID.test(b || '')) return res.status(400).json({ error: 'Two scan ids (a, b) are required' });
    const store = getStore();
    const [ra, rb] = await Promise.all([store.getScan(a, { userId: req.user.id }), store.getScan(b, { userId: req.user.id })]);
    if (!ra || !rb) return res.status(404).json({ error: 'Scan not found' });
    return res.json({ a: slim(ra), b: slim(rb), comparison: compareReports(ra, rb) });
  } catch (err) {
    return next(err);
  }
});

router.get('/scans/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid scan id' });
    const report = await getStore().getScan(req.params.id, { userId: req.user.id });
    if (!report) return res.status(404).json({ error: 'Scan not found' });
    return res.json(report);
  } catch (err) {
    return next(err);
  }
});

router.delete('/scans/:id', requireUser, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid scan id' });
    const ok = await getStore().deleteScan(req.params.id, { userId: req.user.id });
    return ok ? res.status(204).end() : res.status(404).json({ error: 'Scan not found' });
  } catch (err) {
    return next(err);
  }
});

function slim(r) {
  return { id: r.id, url: r.url, finalUrl: r.finalUrl, strategy: r.strategy, createdAt: r.createdAt, scores: r.scores, lab: r.lab, field: r.field, resources: { summary: r.resources?.summary }, issueCounts: r.issueCounts };
}

export default router;
