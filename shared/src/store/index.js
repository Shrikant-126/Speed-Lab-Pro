// Storage abstraction: Supabase (PostgreSQL) when configured, otherwise a local JSON file
// store for development. Both implement the same async interface.

import { createSupabaseStore } from './supabase.js';
import { createFileStore } from './file.js';

let singleton = null;

export function getStore(env = process.env) {
  if (singleton) return singleton;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    singleton = createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    singleton = createFileStore(env.DATA_DIR || (env.VERCEL ? '/tmp/speedlab-data' : './data'));
  }
  return singleton;
}

/** Light-weight summary stored alongside the full report for fast history lists. */
export function summarize(report) {
  return {
    url: report.url,
    final_url: report.finalUrl,
    strategy: report.strategy,
    performance: report.scores?.performance ?? null,
    accessibility: report.scores?.accessibility ?? null,
    best_practices: report.scores?.bestPractices ?? null,
    seo: report.scores?.seo ?? null,
    lcp_ms: report.lab?.lcp?.value ?? null,
    fcp_ms: report.lab?.fcp?.value ?? null,
    cls: report.lab?.cls?.value ?? null,
    tbt_ms: report.lab?.tbt?.value ?? null,
    ttfb_ms: report.lab?.ttfb?.value ?? null,
    total_bytes: report.resources?.summary?.bytes ?? null,
    issue_count: report.issues?.length ?? 0,
    platform: report.platform?.label ?? null,
  };
}
