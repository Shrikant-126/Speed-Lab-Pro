// Talks to the scan worker. Three modes:
//   remote   – WORKER_URL is set: jobs are proxied to the separate worker service (full scans).
//   inline   – on Vercel without WORKER_URL: the scan runs inside this request ("Lite" scans:
//              PageSpeed/Lighthouse, CrUX, document probe and Sharp – no Playwright browser).
//   embedded – local development: the worker's JobManager runs in-process (full scans).

import { randomUUID } from 'node:crypto';

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const SECRET = process.env.WORKER_SECRET || '';

export const workerMode = () => (WORKER_URL ? 'remote' : process.env.VERCEL ? 'inline' : 'embedded');

let embedded = null;
async function embeddedManager() {
  if (!embedded) {
    try {
      const mod = await import('@speedlab/worker/jobs');
      embedded = { manager: mod.getJobManager(), capabilities: mod.capabilities };
    } catch (e) {
      const err = new Error(`Embedded worker could not be loaded: ${e.message}`);
      err.status = 503;
      err.code = 'WORKER_UNAVAILABLE';
      throw err;
    }
  }
  return embedded;
}

// Relative import so Vercel bundles the scan pipeline without installing the worker package.
const loadRunner = () => import('../../worker/src/runScan.js');

async function runInline(payload) {
  const { runScan, SCAN_STEPS } = await loadRunner();
  const job = {
    id: randomUUID(),
    status: 'running',
    progress: 0,
    stage: 'validate',
    message: 'Running',
    steps: SCAN_STEPS.map((s) => ({ key: s.key, label: s.label, status: 'pending' })),
    url: payload.url,
    strategy: payload.strategy,
    owner: payload.userId,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    scanId: null,
    error: null,
    warnings: [],
    mode: 'inline',
  };
  const update = ({ step, status, progress, message, warning }) => {
    if (step) {
      const s = job.steps.find((x) => x.key === step);
      if (s && status) s.status = status;
    }
    if (typeof progress === 'number') job.progress = Math.max(job.progress, Math.round(progress));
    if (message) job.message = message;
    if (warning) job.warnings.push(warning);
  };
  try {
    const { report, scanId } = await runScan(payload, { signal: AbortSignal.timeout(270_000), update });
    Object.assign(job, { status: 'done', progress: 100, message: 'Analysis complete', report, scanId });
  } catch (err) {
    Object.assign(job, { status: 'error', message: err.message, error: { message: err.message || 'Scan failed', code: err.code || 'SCAN_FAILED' } });
    for (const s of job.steps) if (s.status === 'running') s.status = 'error';
  }
  job.finishedAt = new Date().toISOString();
  return job;
}

async function remote(path, init = {}) {
  let res;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-worker-secret': SECRET, ...(init.headers || {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const err = new Error(`Scan worker is unreachable: ${e.message}`);
    err.status = 503;
    err.code = 'WORKER_UNREACHABLE';
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Worker returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function createJob(payload) {
  const mode = workerMode();
  if (mode === 'remote') return remote('/jobs', { method: 'POST', body: JSON.stringify(payload) });
  if (mode === 'inline') return runInline(payload);
  const { manager } = await embeddedManager();
  return manager.create(payload);
}

export async function getJob(id) {
  const mode = workerMode();
  if (mode === 'remote') {
    try {
      return await remote(`/jobs/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }
  if (mode === 'inline') return null; // inline jobs finish within the POST request
  const { manager } = await embeddedManager();
  return manager.get(id);
}

export async function cancelJob(id) {
  const mode = workerMode();
  if (mode === 'remote') return remote(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (mode === 'inline') return null;
  const { manager } = await embeddedManager();
  return manager.cancel(id);
}

export async function workerHealth() {
  try {
    const mode = workerMode();
    if (mode === 'remote') return { mode, ...(await remote('/health')) };
    if (mode === 'inline') {
      const { capabilities } = await loadRunner();
      return { mode, ok: true, lite: true, capabilities: await capabilities() };
    }
    const { manager, capabilities } = await embeddedManager();
    return { mode, ok: true, ...manager.stats(), capabilities: await capabilities() };
  } catch (err) {
    return { mode: workerMode(), ok: false, error: err.message };
  }
}
