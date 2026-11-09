// Supabase (PostgreSQL) store. Uses the service-role key on the server only and always
// filters by user_id explicitly (RLS policies in supabase/schema.sql also enforce this
// for any client-side access).

import { createClient } from '@supabase/supabase-js';
import { summarize } from './index.js';

export function createSupabaseStore(url, serviceKey) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = ({ data, error }) => {
    if (error) {
      const err = new Error(`Database error: ${error.message}`);
      err.status = 500;
      throw err;
    }
    return data;
  };

  return {
    kind: 'supabase',
    client: db,

    async saveScan(report, { userId, projectId = null }) {
      const row = check(
        await db
          .from('scans')
          .insert({ user_id: userId, project_id: projectId, ...summarize(report), report })
          .select('id')
          .single(),
      );
      return row.id;
    },

    async listScans({ userId, url, strategy, projectId, limit = 50, offset = 0 }) {
      let q = db
        .from('scans')
        .select('id,user_id,project_id,created_at,url,final_url,strategy,performance,accessibility,best_practices,seo,lcp_ms,fcp_ms,cls,tbt_ms,ttfb_ms,total_bytes,issue_count,platform', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (url) q = q.ilike('final_url', `%${url.replace(/[%_]/g, '')}%`);
      if (strategy) q = q.eq('strategy', strategy);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error, count } = await q;
      if (error) throw Object.assign(new Error(error.message), { status: 500 });
      return { rows: data, total: count ?? data.length };
    },

    async getScan(id, { userId }) {
      const { data, error } = await db.from('scans').select('id,report').eq('id', id).eq('user_id', userId).maybeSingle();
      if (error) throw Object.assign(new Error(error.message), { status: 500 });
      return data ? { ...data.report, id: data.id } : null;
    },

    async deleteScan(id, { userId }) {
      const data = check(await db.from('scans').delete().eq('id', id).eq('user_id', userId).select('id'));
      return data.length > 0;
    },

    async listProjects({ userId }) {
      return check(await db.from('projects').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
    },
    async createProject({ userId, name, url }) {
      return check(await db.from('projects').insert({ user_id: userId, name, url }).select('*').single());
    },
    async deleteProject(id, { userId }) {
      const data = check(await db.from('projects').delete().eq('id', id).eq('user_id', userId).select('id'));
      return data.length > 0;
    },

    async saveReportMeta({ userId, scanId, compareScanId, title }) {
      return check(await db.from('reports').insert({ user_id: userId, scan_id: scanId, compare_scan_id: compareScanId || null, title }).select('*').single());
    },
    async listReports({ userId }) {
      return check(await db.from('reports').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200));
    },
    async deleteReport(id, { userId }) {
      const data = check(await db.from('reports').delete().eq('id', id).eq('user_id', userId).select('id'));
      return data.length > 0;
    },

    async saveRecommendation({ userId, scanId, issue }) {
      return check(
        await db
          .from('saved_recommendations')
          .insert({ user_id: userId, scan_id: scanId || null, issue_type: issue.type, title: issue.title, priority: issue.priority, issue, status: 'open' })
          .select('*')
          .single(),
      );
    },
    async listRecommendations({ userId }) {
      return check(await db.from('saved_recommendations').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
    },
    async updateRecommendation(id, { userId, status }) {
      return check(await db.from('saved_recommendations').update({ status }).eq('id', id).eq('user_id', userId).select('*').maybeSingle());
    },
    async deleteRecommendation(id, { userId }) {
      const data = check(await db.from('saved_recommendations').delete().eq('id', id).eq('user_id', userId).select('id'));
      return data.length > 0;
    },
  };
}
