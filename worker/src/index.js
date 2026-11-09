// Standalone worker service. Run on a VM/container (Render, Railway, Fly.io, Docker, …),
// NOT on Vercel serverless. The API server talks to it with a shared secret.

import express from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { getJobManager, capabilities } from './jobs.js';

const app = express();
const PORT = Number(process.env.WORKER_PORT || process.env.PORT || 8787);
const SECRET = process.env.WORKER_SECRET || '';

if (!SECRET && process.env.NODE_ENV === 'production') {
  console.error('WORKER_SECRET must be set in production');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '50kb' }));

function auth(req, res, next) {
  if (!SECRET) return next(); // local development only
  const given = Buffer.from(req.get('x-worker-secret') || '');
  const expected = Buffer.from(SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

const jobs = getJobManager();

app.get('/health', async (_req, res) => {
  res.json({ ok: true, ...jobs.stats(), capabilities: await capabilities() });
});

app.post('/jobs', auth, (req, res, next) => {
  try {
    const { url, strategy, userId, projectId } = req.body || {};
    if (typeof url !== 'string' || !['mobile', 'desktop'].includes(strategy)) {
      return res.status(400).json({ error: 'url and strategy (mobile|desktop) are required' });
    }
    const job = jobs.create({ url, strategy, userId: String(userId || 'local'), projectId: projectId || null });
    return res.status(202).json(job);
  } catch (err) {
    return next(err);
  }
});

app.get('/jobs/:id', auth, (req, res) => {
  const job = jobs.get(req.params.id, { includeReport: req.query.report !== '0' });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
});

app.delete('/jobs/:id', auth, (req, res) => {
  const job = jobs.cancel(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Worker error' });
});

app.listen(PORT, () => {
  console.log(`SpeedLab worker listening on :${PORT}`);
});
