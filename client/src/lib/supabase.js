// Supabase browser client (anon key only). Optional – without it the app runs in local mode.

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(URL_ && KEY);

let clientPromise = null;
export function getSupabase() {
  if (!supabaseEnabled) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } }),
    );
  }
  return clientPromise;
}

export async function getAccessToken() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || null;
}
