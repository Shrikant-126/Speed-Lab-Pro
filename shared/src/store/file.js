// Local JSON file store (development / single-instance deployments).
// Summaries live in index.json; full reports in reports/<id>.json.

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { summarize } from './index.js';

export function createFileStore(dir) {
  const root = path.resolve(dir);
  const reportsDir = path.join(root, 'reports');
  const indexFile = path.join(root, 'index.json');
  let lock = Promise.resolve();

  const ready = mkdir(reportsDir, { recursive: true });

  async function load() {
    await ready;
    try {
      return JSON.parse(await readFile(indexFile, 'utf8'));
    } catch {
      return { scans: [], projects: [], reports: [], recommendations: [] };
    }
  }
  function mutate(fn) {
    const next = lock.then(async () => {
      const db = await load();
      const result = await fn(db);
      await writeFile(indexFile, JSON.stringify(db, null, 2));
      return result;
    });
    lock = next.catch(() => {});
    return next;
  }
  const own = (row, userId) => row.user_id === userId;

  return {
    kind: 'file',

    async saveScan(report, { userId, projectId = null }) {
      const id = randomUUID();
      const created_at = report.createdAt || new Date().toISOString();
      await ready;
      await writeFile(path.join(reportsDir, `${id}.json`), JSON.stringify({ ...report, id }));
      await mutate((db) => {
        db.scans.unshift({ id, user_id: userId, project_id: projectId, created_at, ...summarize(report) });
        db.scans = db.scans.slice(0, 2000);
      });
      return id;
    },

    async listScans({ userId, url, strategy, projectId, limit = 50, offset = 0 }) {
      const db = await load();
      let rows = db.scans.filter((s) => own(s, userId));
      if (url) rows = rows.filter((s) => (s.final_url || s.url || '').includes(url));
      if (strategy) rows = rows.filter((s) => s.strategy === strategy);
      if (projectId) rows = rows.filter((s) => s.project_id === projectId);
      return { rows: rows.slice(offset, offset + limit), total: rows.length };
    },

    async getScan(id, { userId }) {
      const db = await load();
      const row = db.scans.find((s) => s.id === id && own(s, userId));
      if (!row) return null;
      try {
        return JSON.parse(await readFile(path.join(reportsDir, `${path.basename(id)}.json`), 'utf8'));
      } catch {
        return null;
      }
    },

    async deleteScan(id, { userId }) {
      const removed = await mutate((db) => {
        const before = db.scans.length;
        db.scans = db.scans.filter((s) => !(s.id === id && own(s, userId)));
        return before !== db.scans.length;
      });
      if (removed) await rm(path.join(reportsDir, `${path.basename(id)}.json`), { force: true });
      return removed;
    },

    async listProjects({ userId }) {
      const db = await load();
      return db.projects.filter((p) => own(p, userId));
    },
    async createProject({ userId, name, url }) {
      const row = { id: randomUUID(), user_id: userId, name, url, created_at: new Date().toISOString() };
      await mutate((db) => db.projects.unshift(row));
      return row;
    },
    async deleteProject(id, { userId }) {
      return mutate((db) => {
        const before = db.projects.length;
        db.projects = db.projects.filter((p) => !(p.id === id && own(p, userId)));
        db.scans.forEach((s) => { if (s.project_id === id && own(s, userId)) s.project_id = null; });
        return before !== db.projects.length;
      });
    },

    async saveReportMeta({ userId, scanId, compareScanId, title }) {
      const row = { id: randomUUID(), user_id: userId, scan_id: scanId, compare_scan_id: compareScanId || null, title, created_at: new Date().toISOString() };
      await mutate((db) => db.reports.unshift(row));
      return row;
    },
    async listReports({ userId }) {
      const db = await load();
      return db.reports.filter((r) => own(r, userId)).slice(0, 200);
    },
    async deleteReport(id, { userId }) {
      return mutate((db) => {
        const before = db.reports.length;
        db.reports = db.reports.filter((r) => !(r.id === id && own(r, userId)));
        return before !== db.reports.length;
      });
    },

    async saveRecommendation({ userId, scanId, issue }) {
      const row = { id: randomUUID(), user_id: userId, scan_id: scanId || null, issue_type: issue.type, title: issue.title, priority: issue.priority, issue, status: 'open', created_at: new Date().toISOString() };
      await mutate((db) => db.recommendations.unshift(row));
      return row;
    },
    async listRecommendations({ userId }) {
      const db = await load();
      return db.recommendations.filter((r) => own(r, userId));
    },
    async updateRecommendation(id, { userId, status }) {
      return mutate((db) => {
        const r = db.recommendations.find((x) => x.id === id && own(x, userId));
        if (r) r.status = status;
        return r || null;
      });
    },
    async deleteRecommendation(id, { userId }) {
      return mutate((db) => {
        const before = db.recommendations.length;
        db.recommendations = db.recommendations.filter((r) => !(r.id === id && own(r, userId)));
        return before !== db.recommendations.length;
      });
    },
  };
}
