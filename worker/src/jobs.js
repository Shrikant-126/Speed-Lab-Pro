// In-memory job queue with concurrency control, progress reporting and cancellation.
// Used by the standalone worker service and (in local development) embedded in the API.

import { randomUUID } from 'node:crypto';
import { runScan, SCAN_STEPS } from './runScan.js';

export class JobManager {
  constructor({ concurrency = 2, ttlMs = 60 * 60 * 1000, maxQueued = 50 } = {}) {
    this.concurrency = concurrency;
    this.ttlMs = ttlMs;
    this.maxQueued = maxQueued;
    this.jobs = new Map();
    this.queue = [];
    this.running = 0;
    this.timer = setInterval(() => this.cleanup(), 60_000);
    this.timer.unref?.();
  }

  create(payload) {
    if (this.queue.length >= this.maxQueued) {
      const err = new Error('The scan queue is full, please try again in a minute');
      err.status = 503;
      throw err;
    }
    const job = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      stage: 'queued',
      message: 'Waiting for a free worker slot',
      steps: SCAN_STEPS.map((s) => ({ key: s.key, label: s.label, status: 'pending' })),
      url: payload.url,
      strategy: payload.strategy,
      userId: payload.userId,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      scanId: null,
      report: null,
      error: null,
      warnings: [],
      controller: new AbortController(),
      payload,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.pump();
    return this.view(job);
  }

  get(id, { includeReport = true } = {}) {
    const job = this.jobs.get(id);
    return job ? this.view(job, includeReport) : null;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (['done', 'error', 'cancelled'].includes(job.status)) return this.view(job, false);
    job.controller.abort(new Error('Scan cancelled by user'));
    if (job.status === 'queued') {
      this.queue = this.queue.filter((j) => j !== job);
      this.finish(job, 'cancelled', 'Scan cancelled');
    } else {
      job.message = 'Cancelling…';
    }
    return this.view(job, false);
  }

  view(job, includeReport = true) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      message: job.message,
      steps: job.steps,
      url: job.url,
      strategy: job.strategy,
      owner: job.userId,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      scanId: job.scanId,
      error: job.error,
      warnings: job.warnings,
      queuePosition: job.status === 'queued' ? this.queue.indexOf(job) + 1 : 0,
      report: includeReport && job.status === 'done' ? job.report : undefined,
    };
  }

  finish(job, status, message) {
    job.status = status;
    job.message = message;
    job.finishedAt = new Date().toISOString();
    if (status !== 'done') {
      for (const s of job.steps) if (s.status === 'running') s.status = status === 'cancelled' ? 'cancelled' : 'error';
    }
    delete job.payload;
  }

  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift();
      this.running += 1;
      this.execute(job).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  async execute(job) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    const update = ({ step, status, progress, message, warning }) => {
      if (step) {
        const s = job.steps.find((x) => x.key === step);
        if (s && status) s.status = status;
        if (status === 'running') job.stage = step;
      }
      if (typeof progress === 'number') job.progress = Math.max(job.progress, Math.min(99, Math.round(progress)));
      if (message) job.message = message;
      if (warning) job.warnings.push(warning);
    };
    try {
      const { report, scanId } = await runScan(job.payload, { signal: job.controller.signal, update });
      job.report = report;
      job.scanId = scanId;
      job.progress = 100;
      this.finish(job, 'done', 'Analysis complete');
    } catch (err) {
      if (job.controller.signal.aborted) {
        this.finish(job, 'cancelled', 'Scan cancelled');
      } else {
        job.error = { message: err.message || 'Scan failed', code: err.code || 'SCAN_FAILED' };
        this.finish(job, 'error', err.message || 'Scan failed');
      }
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.finishedAt && now - Date.parse(job.finishedAt) > this.ttlMs) this.jobs.delete(id);
    }
  }

  stats() {
    return { running: this.running, queued: this.queue.length, concurrency: this.concurrency, jobs: this.jobs.size };
  }
}

let shared = null;
export function getJobManager() {
  if (!shared) shared = new JobManager({ concurrency: Number(process.env.WORKER_CONCURRENCY || 2) });
  return shared;
}

export { capabilities } from './runScan.js';
