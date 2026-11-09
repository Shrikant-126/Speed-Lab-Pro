// Authentication: verifies Supabase access tokens (Authorization: Bearer <jwt>).
// When Supabase is not configured the app runs in single-user "local" mode.

import { createClient } from '@supabase/supabase-js';

let supabase = null;
function client() {
  if (!supabase && process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

const cache = new Map();

export function authEnabled() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function authenticate(req, _res, next) {
  req.user = null;
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token && client()) {
    const hit = cache.get(token);
    if (hit && hit.expires > Date.now()) req.user = hit.user;
    else {
      const { data, error } = await client().auth.getUser(token);
      if (!error && data?.user) {
        req.user = { id: data.user.id, email: data.user.email };
        cache.set(token, { user: req.user, expires: Date.now() + 60_000 });
        if (cache.size > 5000) cache.clear();
      }
    }
  }
  if (!req.user && !authEnabled()) req.user = { id: 'local', email: null, local: true };
  next();
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Please sign in to use this feature', code: 'AUTH_REQUIRED' });
}
