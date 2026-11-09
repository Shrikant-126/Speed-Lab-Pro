// Talks to the scan worker. If WORKER_URL is set, requests are proxied to the remote worker
// (production). Otherwise the worker's JobManager is loaded in-process (local development).

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const SECRET = process.env.WORKER_SECRET || '';

let embedded = null;
async function embeddedManager() {
  if (!embedded) {
    if (process.env.VERCEL) {
      const err = new Error('WORKER_URL is not configured. Browser-based scans need the separate worker service (see docs/DEPLOYMENT.md).');
      err.status = 503;
      err.code = 'WORKER_NOT_CONFIGURED';
      throw err;
    }
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

export const workerMode = () => (WORKER_URL ? 'remote' : process.env.VERCEL ? 'missing' : 'embedded');

export async function createJob(payload) {
  if (WORKER_URL) return remote('/jobs', { method: 'POST', body: JSON.stringify(payload) });
  const { manager } = await embeddedManager();
  return manager.create(payload);
}

export async function getJob(id) {
  if (WORKER_URL) {
    try {
      return await remote(`/jobs/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }
  const { manager } = await embeddedManager();
  return manager.get(id);
}

export async function cancelJob(id) {
  if (WORKER_URL) return remote(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const { manager } = await embeddedManager();
  return manager.cancel(id);
}

export async function workerHealth() {
  try {
    if (WORKER_URL) return { mode: 'remote', ...(await remote('/health')) };
    if (process.env.VERCEL) return { mode: 'missing', ok: false };
    const { manager, capabilities } = await embeddedManager();
    return { mode: 'embedded', ok: true, ...manager.stats(), capabilities: await capabilities() };
  } catch (err) {
    return { mode: workerMode(), ok: false, error: err.message };
  }
}
